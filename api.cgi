#!/usr/bin/perl
use strict;
use warnings;
use utf8;
use DBI;
use JSON::PP;
use Digest::SHA qw(hmac_sha256);
use MIME::Base64 ();

# nenpyo (歴史年表) API  (CGI / Perl + PostgreSQL)
#
# 配信:  Apache UserDir 配下、suexec で sugawara として実行される。
#        そのため PostgreSQL へは peer 認証（パスワード不要）で接続できる。
# DB:    nenpyo（users / sessions / events）。定義は ddl/*.sql 参照。
# 認証:  ログイン時にランダムトークンを sessions に保存し、HttpOnly Cookie
#        (nenpyo_sid) で受け渡す。パスワードは PBKDF2-HMAC-SHA256 で保存。
#
# エンドポイント（?action= と REQUEST_METHOD で分岐）:
#   POST   ?action=register  {username,password}  -> 登録してログイン状態に
#   POST   ?action=login     {username,password}  -> ログイン
#   POST   ?action=logout                          -> ログアウト
#   GET    ?action=me                              -> {username} or 401
#   GET    ?action=events                          -> 自分の出来事一覧
#   POST   ?action=event     {..., tag_ids:[..]}   -> 追加
#   PUT    ?action=event&id=<id>  {同上}           -> 更新
#   DELETE ?action=event&id=<id>                   -> 削除
#   GET    ?action=tags                            -> 自分のタグ一覧
#   POST   ?action=tag       {name,color}          -> タグ作成
#   PUT    ?action=tag&id=<id>    {name,color}     -> タグ更新
#   DELETE ?action=tag&id=<id>                     -> タグ削除
#   POST   ?action=tags_reorder  {ids:[..]}        -> タグの並び順を配列順に更新

my $COOKIE_NAME  = 'nenpyo_sid';
my $COOKIE_PATH  = '/~sugawara/nenpyo/';
my $SESSION_DAYS = 30;
my $PBKDF2_ITER  = 120000;

my $JSON = JSON::PP->new->utf8->canonical;

# ---- HTTP 出力 -------------------------------------------------------------
my @EXTRA_HEADERS;
sub add_header { push @EXTRA_HEADERS, $_[0]; }

sub respond {
    my ($data, $status) = @_;
    $status ||= '200 OK';
    my $body = $JSON->encode($data);
    binmode STDOUT;
    print "Status: $status\r\n";
    print "Content-Type: application/json; charset=utf-8\r\n";
    print "$_\r\n" for @EXTRA_HEADERS;
    print "Content-Length: " . length($body) . "\r\n";
    print "\r\n";
    print $body;
    exit 0;
}

sub fail {
    my ($message, $status) = @_;
    $status ||= '400 Bad Request';
    respond({ error => $message }, $status);
}

# ---- 入力 ------------------------------------------------------------------
sub query_param {
    my ($name) = @_;
    my $qs = $ENV{QUERY_STRING} || '';
    for my $pair (split /&/, $qs) {
        my ($k, $v) = split /=/, $pair, 2;
        next unless defined $k && $k eq $name;
        $v = '' unless defined $v;
        $v =~ tr/+/ /;
        $v =~ s/%([0-9A-Fa-f]{2})/chr(hex($1))/ge;
        return $v;
    }
    return undef;
}

sub read_body_json {
    my $length = $ENV{CONTENT_LENGTH} || 0;
    return {} if $length <= 0;
    my $raw = '';
    read(STDIN, $raw, $length);
    return {} if !defined $raw || $raw eq '';
    my $data = eval { $JSON->decode($raw) };
    return $data && ref($data) eq 'HASH' ? $data : {};
}

sub get_cookie {
    my ($name) = @_;
    my $raw = $ENV{HTTP_COOKIE} || '';
    for my $pair (split /;\s*/, $raw) {
        my ($k, $v) = split /=/, $pair, 2;
        next unless defined $k && $k eq $name;
        return defined $v ? $v : '';
    }
    return undef;
}

# ---- 乱数・パスワード ------------------------------------------------------
sub random_hex {
    my ($bytes) = @_;
    open my $fh, '<:raw', '/dev/urandom' or die "urandom: $!";
    read($fh, my $buf, $bytes);
    close $fh;
    return unpack('H*', $buf);
}

# PBKDF2-HMAC-SHA256, 1 ブロック (32byte) 分。hex を返す。
sub pbkdf2 {
    my ($password, $salt_hex, $iter) = @_;
    my $salt = pack('H*', $salt_hex);
    utf8::encode($password) if utf8::is_utf8($password);
    my $u   = hmac_sha256($salt . pack('N', 1), $password);
    my $out = $u;
    for (my $i = 1; $i < $iter; $i++) {
        $u = hmac_sha256($u, $password);
        $out ^= $u;
    }
    return unpack('H*', $out);
}

# 一定時間比較（タイミング攻撃緩和）
sub const_eq {
    my ($a, $b) = @_;
    return 0 if length($a) != length($b);
    my $r = 0;
    $r |= ord(substr($a, $_, 1)) ^ ord(substr($b, $_, 1)) for 0 .. length($a) - 1;
    return $r == 0;
}

# ---- DB --------------------------------------------------------------------
sub db {
    my $dbh = DBI->connect(
        'dbi:Pg:dbname=nenpyo', '', '',
        { RaiseError => 1, AutoCommit => 1, PrintError => 0, pg_enable_utf8 => 1 }
    ) or fail('db connect failed', '500 Internal Server Error');
    return $dbh;
}

# ---- セッション ------------------------------------------------------------
sub set_session_cookie {
    my ($token) = @_;
    my $max = $SESSION_DAYS * 24 * 3600;
    add_header("Set-Cookie: $COOKIE_NAME=$token; Path=$COOKIE_PATH; Max-Age=$max; HttpOnly; Secure; SameSite=Lax");
}

sub clear_session_cookie {
    add_header("Set-Cookie: $COOKIE_NAME=; Path=$COOKIE_PATH; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
}

# 現在のログインユーザー {id, username} を返す。未ログインなら undef。
sub current_user {
    my ($dbh) = @_;
    my $token = get_cookie($COOKIE_NAME);
    return undef unless defined $token && $token =~ /^[0-9a-f]{16,128}$/;
    my $row = $dbh->selectrow_hashref(
        'SELECT u.id, u.username FROM sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.token = ? AND s.expires_at > now()',
        undef, $token
    );
    return $row;
}

sub require_user {
    my ($dbh) = @_;
    my $u = current_user($dbh);
    fail('not authenticated', '401 Unauthorized') unless $u;
    return $u;
}

# ---- 出来事 ----------------------------------------------------------------
# 年月日の3つ組を検証。year_required が真なら年は必須。
# 年が無ければ (undef,undef,undef) を返す。月無しで日のみ／年無しで月のみは不可。
sub clean_date {
    my ($label, $y, $mo, $d, $required) = @_;
    my ($year, $month, $day);
    if (defined $y && "$y" ne '') {
        fail("${label}の年が不正です") unless "$y" =~ /^-?\d+$/;
        $year = 0 + $y;
        # 先史時代（縄文=前14000年頃など）も扱えるよう下限を広く取る
        fail("${label}の年が範囲外です") if $year < -1000000 || $year > 9999;
        # 西暦0年は存在しない（1BCの翌日はAD1）。紀元前は負、紀元後は正で指定する。
        fail("西暦0年は存在しません（紀元前は負の数、例: -1 を使ってください）") if $year == 0;
    } else {
        fail("${label}の年は必須です") if $required;
        return (undef, undef, undef);
    }
    if (defined $mo && "$mo" ne '') {
        fail("${label}の月が不正です") unless "$mo" =~ /^\d+$/ && $mo >= 1 && $mo <= 12;
        $month = 0 + $mo;
    }
    if (defined $d && "$d" ne '') {
        fail("${label}の日は月とともに指定してください") unless defined $month;
        fail("${label}の日が不正です") unless "$d" =~ /^\d+$/ && $d >= 1 && $d <= 31;
        $day = 0 + $d;
    }
    return ($year, $month, $day);
}

# 入力を検証して (sy,sm,sd, ey,em,ed, title,detail) に正規化
sub clean_event {
    my ($body) = @_;
    my ($sy, $sm, $sd) = clean_date('開始', $body->{start_year}, $body->{start_month}, $body->{start_day}, 1);
    my ($ey, $em, $ed) = clean_date('終了', $body->{end_year},   $body->{end_month},   $body->{end_day},   0);

    my $title  = defined $body->{title}  ? $body->{title}  : '';
    my $detail = defined $body->{detail} ? $body->{detail} : '';
    $title =~ s/\r//g; $title =~ s/\n/ /g;
    $title  = substr($title, 0, 300);

    return ($sy, $sm, $sd, $ey, $em, $ed, $title, $detail);
}

my $EVENT_COLS = "id, start_year, start_month, start_day, end_year, end_month, end_day, title, detail,
                  extract(epoch FROM created_at)::bigint AS created,
                  extract(epoch FROM updated_at)::bigint AS updated";

sub event_row {
    my ($dbh, $user_id, $id) = @_;
    return $dbh->selectrow_hashref(
        "SELECT $EVENT_COLS FROM events WHERE id = ? AND user_id = ?",
        undef, $id, $user_id
    );
}

# 数値か undef に整える小ヘルパ
sub numornull { defined $_[0] ? 0 + $_[0] : undef }

# ユーザーの全イベントについて event_id -> [tag_id...] のマップを作る。
# タグ名昇順で並べるので、配列の先頭が「期間バーの色」に使われるタグになる。
sub event_tag_map {
    my ($dbh, $user_id) = @_;
    my $rows = $dbh->selectall_arrayref(
        'SELECT et.event_id, et.tag_id FROM event_tags et
           JOIN tags t ON t.id = et.tag_id
          WHERE t.user_id = ?
          ORDER BY t.name, t.id',
        { Slice => {} }, $user_id
    );
    my %map;
    push @{ $map{ $_->{event_id} } }, 0 + $_->{tag_id} for @$rows;
    return \%map;
}

# 1イベント分の tag_id 配列（タグ名昇順）
sub event_tag_ids {
    my ($dbh, $event_id) = @_;
    my $rows = $dbh->selectcol_arrayref(
        'SELECT et.tag_id FROM event_tags et
           JOIN tags t ON t.id = et.tag_id
          WHERE et.event_id = ?
          ORDER BY t.name, t.id',
        undef, $event_id
    );
    return [ map { 0 + $_ } @$rows ];
}

# イベントのタグ結びつきを与えられた tag_ids で置き換える（所有チェック込み）。
sub set_event_tags {
    my ($dbh, $user_id, $event_id, $tag_ids) = @_;
    $dbh->do('DELETE FROM event_tags WHERE event_id = ?', undef, $event_id);
    return unless ref $tag_ids eq 'ARRAY' && @$tag_ids;
    my $sth = $dbh->prepare(
        'INSERT INTO event_tags (event_id, tag_id)
         SELECT ?, id FROM tags WHERE id = ? AND user_id = ?
         ON CONFLICT DO NOTHING'
    );
    for my $tid (@$tag_ids) {
        next unless defined $tid && "$tid" =~ /^\d+$/;
        $sth->execute($event_id, 0 + $tid, $user_id);
    }
}

# DB の文字列を数値/JSON 型に整える
sub event_json {
    my ($r, $tag_ids) = @_;
    return {
        id          => 0 + $r->{id},
        start_year  => 0 + $r->{start_year},
        start_month => numornull($r->{start_month}),
        start_day   => numornull($r->{start_day}),
        end_year    => numornull($r->{end_year}),
        end_month   => numornull($r->{end_month}),
        end_day     => numornull($r->{end_day}),
        title       => $r->{title},
        detail      => $r->{detail},
        tag_ids     => $tag_ids || [],
        created     => 0 + $r->{created},
        updated     => 0 + $r->{updated},
    };
}

# タグ入力の検証。(name, color, prime) を返す。prime は省略時 false。
sub clean_tag {
    my ($body) = @_;
    my $name = defined $body->{name} ? $body->{name} : '';
    $name =~ s/^\s+|\s+$//g;
    $name =~ s/[\r\n]/ /g;
    fail('タグ名を入力してください') if $name eq '';
    fail('タグ名は30文字以内にしてください') if length($name) > 30;
    my $color = defined $body->{color} && "$body->{color}" ne '' ? $body->{color} : '#9a6b3f';
    fail('色の形式が正しくありません（例: #aabbcc）') unless $color =~ /^#[0-9a-fA-F]{6}$/;
    my $prime = $body->{prime} ? 1 : 0;
    return ($name, lc $color, $prime);
}

# DBD::Pg の真偽値（既定では 1/0）を JSON 真偽へ。't'/'f' でも安全に扱う。
sub pgbool { my $v = $_[0]; (defined $v && $v ne '' && $v ne '0' && lc $v ne 'f') ? JSON::PP::true : JSON::PP::false }

sub tag_json {
    my ($r) = @_;
    return {
        id    => 0 + $r->{id},
        name  => $r->{name},
        color => $r->{color},
        prime => pgbool($r->{prime}),
        sort_order => 0 + ($r->{sort_order} // 0),
    };
}

# ---- ルーティング ----------------------------------------------------------
my $method = uc($ENV{REQUEST_METHOD} || 'GET');
my $action = query_param('action') || '';

eval {
    my $dbh = db();

    if ($action eq 'register' && $method eq 'POST') {
        my $body = read_body_json();
        my $username = defined $body->{username} ? $body->{username} : '';
        my $password = defined $body->{password} ? $body->{password} : '';
        $username =~ s/^\s+|\s+$//g;
        fail('ユーザー名は1〜50文字で入力してください') if $username eq '' || length($username) > 50;
        fail('パスワードは4文字以上にしてください') if length($password) < 4;

        my $exists = $dbh->selectrow_array('SELECT 1 FROM users WHERE username = ?', undef, $username);
        fail('このユーザー名は既に使われています', '409 Conflict') if $exists;

        my $salt = random_hex(16);
        my $hash = pbkdf2($password, $salt, $PBKDF2_ITER);
        my $uid  = $dbh->selectrow_array(
            'INSERT INTO users (username, password_hash, salt, iterations)
             VALUES (?,?,?,?) RETURNING id',
            undef, $username, $hash, $salt, $PBKDF2_ITER
        );
        my $token = random_hex(32);
        $dbh->do(
            "INSERT INTO sessions (token, user_id, expires_at)
             VALUES (?,?, now() + interval '$SESSION_DAYS days')",
            undef, $token, $uid
        );
        set_session_cookie($token);
        respond({ username => $username });
    }
    elsif ($action eq 'login' && $method eq 'POST') {
        my $body = read_body_json();
        my $username = defined $body->{username} ? $body->{username} : '';
        my $password = defined $body->{password} ? $body->{password} : '';
        $username =~ s/^\s+|\s+$//g;
        my $u = $dbh->selectrow_hashref(
            'SELECT id, username, password_hash, salt, iterations FROM users WHERE username = ?',
            undef, $username
        );
        fail('ユーザー名またはパスワードが違います', '401 Unauthorized') unless $u;
        my $hash = pbkdf2($password, $u->{salt}, $u->{iterations});
        fail('ユーザー名またはパスワードが違います', '401 Unauthorized')
            unless const_eq($hash, $u->{password_hash});

        my $token = random_hex(32);
        $dbh->do(
            "INSERT INTO sessions (token, user_id, expires_at)
             VALUES (?,?, now() + interval '$SESSION_DAYS days')",
            undef, $token, $u->{id}
        );
        set_session_cookie($token);
        respond({ username => $u->{username} });
    }
    elsif ($action eq 'logout' && $method eq 'POST') {
        my $token = get_cookie($COOKIE_NAME);
        $dbh->do('DELETE FROM sessions WHERE token = ?', undef, $token)
            if defined $token && $token =~ /^[0-9a-f]+$/;
        clear_session_cookie();
        respond({ ok => JSON::PP::true });
    }
    elsif ($action eq 'me' && $method eq 'GET') {
        my $u = current_user($dbh);
        fail('not authenticated', '401 Unauthorized') unless $u;
        respond({ username => $u->{username} });
    }
    elsif ($action eq 'events' && $method eq 'GET') {
        my $u = require_user($dbh);
        my $rows = $dbh->selectall_arrayref(
            "SELECT $EVENT_COLS FROM events WHERE user_id = ?
              ORDER BY start_year, start_month NULLS FIRST, start_day NULLS FIRST, id",
            { Slice => {} }, $u->{id}
        );
        my $map = event_tag_map($dbh, $u->{id});
        respond([ map { event_json($_, $map->{ $_->{id} } || []) } @$rows ]);
    }
    elsif ($action eq 'event' && $method eq 'POST') {
        my $u = require_user($dbh);
        my $body = read_body_json();
        my ($sy, $sm, $sd, $ey, $em, $ed, $title, $detail) = clean_event($body);
        my $id = $dbh->selectrow_array(
            'INSERT INTO events (user_id, start_year, start_month, start_day, end_year, end_month, end_day, title, detail)
             VALUES (?,?,?,?,?,?,?,?,?) RETURNING id',
            undef, $u->{id}, $sy, $sm, $sd, $ey, $em, $ed, $title, $detail
        );
        set_event_tags($dbh, $u->{id}, $id, $body->{tag_ids});
        respond(event_json(event_row($dbh, $u->{id}, $id), event_tag_ids($dbh, $id)));
    }
    elsif ($action eq 'event' && $method eq 'PUT') {
        my $u  = require_user($dbh);
        my $id = query_param('id');
        fail('invalid id') unless defined $id && $id =~ /^\d+$/;
        fail('not found', '404 Not Found') unless event_row($dbh, $u->{id}, $id);
        my $body = read_body_json();
        my ($sy, $sm, $sd, $ey, $em, $ed, $title, $detail) = clean_event($body);
        $dbh->do(
            'UPDATE events SET start_year=?, start_month=?, start_day=?,
                               end_year=?, end_month=?, end_day=?,
                               title=?, detail=?, updated_at=now()
              WHERE id=? AND user_id=?',
            undef, $sy, $sm, $sd, $ey, $em, $ed, $title, $detail, $id, $u->{id}
        );
        set_event_tags($dbh, $u->{id}, $id, $body->{tag_ids});
        respond(event_json(event_row($dbh, $u->{id}, $id), event_tag_ids($dbh, $id)));
    }
    elsif ($action eq 'event' && $method eq 'DELETE') {
        my $u  = require_user($dbh);
        my $id = query_param('id');
        fail('invalid id') unless defined $id && $id =~ /^\d+$/;
        $dbh->do('DELETE FROM events WHERE id=? AND user_id=?', undef, $id, $u->{id});
        respond({ ok => JSON::PP::true });
    }
    elsif ($action eq 'tags' && $method eq 'GET') {
        my $u = require_user($dbh);
        my $rows = $dbh->selectall_arrayref(
            'SELECT id, name, color, prime, sort_order FROM tags WHERE user_id = ? ORDER BY name, id',
            { Slice => {} }, $u->{id}
        );
        respond([ map { tag_json($_) } @$rows ]);
    }
    elsif ($action eq 'tag' && $method eq 'POST') {
        my $u = require_user($dbh);
        # 新規タグは既定で prime=false（色を持たない）。並び順は末尾（最大+1）。
        my ($name, $color, $prime) = clean_tag(read_body_json());
        fail('同じ名前のタグが既にあります', '409 Conflict')
            if $dbh->selectrow_array('SELECT 1 FROM tags WHERE user_id=? AND name=?', undef, $u->{id}, $name);
        my $next = $dbh->selectrow_array('SELECT COALESCE(MAX(sort_order),0)+1 FROM tags WHERE user_id=?', undef, $u->{id});
        my $row = $dbh->selectrow_hashref(
            'INSERT INTO tags (user_id, name, color, prime, sort_order) VALUES (?,?,?,?,?)
             RETURNING id, name, color, prime, sort_order',
            undef, $u->{id}, $name, $color, $prime, $next
        );
        respond(tag_json($row));
    }
    elsif ($action eq 'tags_reorder' && $method eq 'POST') {
        my $u = require_user($dbh);
        my $body = read_body_json();
        my $ids = $body->{ids};
        fail('ids が配列ではありません') unless ref $ids eq 'ARRAY';
        # 配列の並び順で sort_order を 1..n に振り直す（本人のタグのみ）。
        my $sth = $dbh->prepare('UPDATE tags SET sort_order=? WHERE id=? AND user_id=?');
        my $pos = 0;
        for my $tid (@$ids) {
            next unless defined $tid && "$tid" =~ /^\d+$/;
            $pos++;
            $sth->execute($pos, 0 + $tid, $u->{id});
        }
        my $rows = $dbh->selectall_arrayref(
            'SELECT id, name, color, prime, sort_order FROM tags WHERE user_id = ? ORDER BY name, id',
            { Slice => {} }, $u->{id}
        );
        respond([ map { tag_json($_) } @$rows ]);
    }
    elsif ($action eq 'tag' && $method eq 'PUT') {
        my $u  = require_user($dbh);
        my $id = query_param('id');
        fail('invalid id') unless defined $id && $id =~ /^\d+$/;
        fail('not found', '404 Not Found')
            unless $dbh->selectrow_array('SELECT 1 FROM tags WHERE id=? AND user_id=?', undef, $id, $u->{id});
        my $body = read_body_json();
        my ($name, $color, $prime) = clean_tag($body);
        fail('同じ名前のタグが既にあります', '409 Conflict')
            if $dbh->selectrow_array('SELECT 1 FROM tags WHERE user_id=? AND name=? AND id<>?', undef, $u->{id}, $name, $id);
        # prime はリクエストに含まれているときだけ更新する（設定の色変更などでは保持）。
        if (exists $body->{prime}) {
            $dbh->do('UPDATE tags SET name=?, color=?, prime=? WHERE id=? AND user_id=?',
                undef, $name, $color, $prime, $id, $u->{id});
        } else {
            $dbh->do('UPDATE tags SET name=?, color=? WHERE id=? AND user_id=?',
                undef, $name, $color, $id, $u->{id});
        }
        my $cur = $dbh->selectrow_hashref('SELECT id, name, color, prime, sort_order FROM tags WHERE id=? AND user_id=?', undef, $id, $u->{id});
        respond(tag_json($cur));
    }
    elsif ($action eq 'tag' && $method eq 'DELETE') {
        my $u  = require_user($dbh);
        my $id = query_param('id');
        fail('invalid id') unless defined $id && $id =~ /^\d+$/;
        $dbh->do('DELETE FROM tags WHERE id=? AND user_id=?', undef, $id, $u->{id});
        respond({ ok => JSON::PP::true });
    }
    else {
        fail('not found', '404 Not Found');
    }
    1;
} or do {
    my $err = $@ || 'unknown error';
    fail("server error: $err", '500 Internal Server Error');
};
