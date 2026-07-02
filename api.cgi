#!/usr/bin/perl
use strict;
use warnings;
use utf8;
use DBI;
use JSON::PP;
use Digest::SHA qw(hmac_sha256);
use MIME::Base64 ();
use File::Basename qw(dirname);

# nenpyo (歴史年表) API  (CGI / Perl + PostgreSQL)
#
# 配信:  Apache UserDir 配下、suexec で sugawara として実行される。
#        そのため PostgreSQL へは peer 認証（パスワード不要）で接続できる。
# DB:    nenpyo（users / sessions / nenpyo / events）。定義は ddl/*.sql 参照。
# 認証:  ログイン時にランダムトークンを sessions に保存し、HttpOnly Cookie
#        (nenpyo_sid) で受け渡す。パスワードは PBKDF2-HMAC-SHA256 で保存。
#
# エンドポイント（?action= と REQUEST_METHOD で分岐）:
#   POST   ?action=signup_request  {email}         -> 確認リンクをメール送信（まだ登録しない）
#                                                     既に登録済みなら 409 {error:'duplicate', fields:['email']}
#   GET    ?action=signup_verify&token=<t>         -> {email}（リンクの有効性確認）
#   POST   ?action=signup_complete {token,username,password}
#                                                  -> 登録してログイン状態に
#                                                     重複時は 409 {error:'duplicate', fields:['email'|'username',...]}
#   POST   ?action=login     {email,password}      -> ログイン（メールアドレスで認証）
#   POST   ?action=logout                          -> ログアウト
#   POST   ?action=change_password {current_password,new_password}
#                                                  -> パスワード変更
#   DELETE ?action=account                         -> アカウント削除（関連データを全消去）
#   GET    ?action=env                             -> {env}（実行環境名。env.pl 由来）
#   GET    ?action=dev_users                       -> 全ユーザー一覧（開発環境のみ。本番は404）
#   GET    ?action=dev_user_timeline&id=<uid>      -> 指定ユーザーの年表+イベント（開発環境のみ）
#   GET    ?action=color_schemes                   -> 配色パターン一覧+色（要ログイン）
#   PUT    ?action=dev_color_scheme&id=<id>        -> 配色名を更新（開発環境のみ）
#   PUT    ?action=dev_color&id=<id>               -> 配色内の1色を更新（開発環境のみ）
#   POST   ?action=dev_color_schemes_reorder {ids} -> 配色の並び順を配列順に更新（開発環境のみ）
#   POST   ?action=dev_color_scheme_copy&id=<id>   -> 配色を複製して新規作成（開発環境のみ）
#   GET    ?action=me                              -> {username} or 401
#   GET    ?action=events                          -> 自分の出来事一覧
#   POST   ?action=event     {..., nenpyo_id}      -> 追加（属する年表 id。無しは null）
#   PUT    ?action=event&id=<id>  {同上}           -> 更新
#   DELETE ?action=event&id=<id>                   -> 削除
#   GET    ?action=tags                            -> 自分の年表一覧（nenpyo）
#   POST   ?action=tag       {name,color}          -> 年表作成
#   PUT    ?action=tag&id=<id>    {name,color}     -> 年表更新
#   DELETE ?action=tag&id=<id>[&with_events=1]     -> 年表削除（with_events=1 で配下イベントも削除）
#   POST   ?action=tags_reorder  {ids:[..]}        -> 年表の並び順を配列順に更新
#   POST   ?action=follow    {nenpyo_id}           -> 年表をフォロー（name/color をコピーした仮想年表を作成）
#   DELETE ?action=follow&nenpyo_id=<id>           -> フォロー解除（その仮想年表行を削除）
#   （フォロー中の年表は tags / events に仮想年表として混ざって返る。専用 follows/followed は廃止）

my $COOKIE_NAME  = 'nenpyo_sid';
# Cookie の Path は配信パスに合わせて自動判定する（環境ごとに固定値を持たない）。
# SCRIPT_NAME から api.cgi を除いたディレクトリ部を使う。
#   dev: /~sugawara/nenpyo/api.cgi -> /~sugawara/nenpyo/
#   本番: /api.cgi               -> /
my $COOKIE_PATH  = $ENV{SCRIPT_NAME} || '/';
$COOKIE_PATH =~ s#/[^/]*$#/#;   # 末尾の "api.cgi" を取り除きディレクトリ部に
$COOKIE_PATH = '/' if $COOKIE_PATH eq '';
my $SESSION_DAYS = 30;
my $PBKDF2_ITER  = 120000;
my $SIGNUP_TOKEN_HOURS = 1;                 # サインアップ用リンクの有効期限
my $MAIL_FROM    = 'nenpyo@peanutsjamjam.jp'; # 確認メールの差出人

# 実行環境名。api.cgi と同じディレクトリの env.pl（git 管理外。dev/本番で内容が異なる）を
# require し、その中で $main::NENPYO_ENV を設定する。未設置なら 'unknown'。
our $NENPYO_ENV = 'unknown';
{
    my $env_file = dirname(__FILE__) . '/env.pl';
    require $env_file if -f $env_file;
}

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
    # $code はエラーコード（フロントで i18n 翻訳）。$params は補間値（任意）。
    my ($code, $status, $params) = @_;
    $status ||= '400 Bad Request';
    my $body = { error => $code };
    $body->{params} = $params if defined $params;
    respond($body, $status);
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
    ) or fail('db_error', '500 Internal Server Error');
    return $dbh;
}

# 新規ユーザー用のサンプル年表を作る。ddl/default_example_*.sql を読み、
# :uid を対象ユーザー id（自前生成の整数なので安全）に置換して実行する。
# 失敗してもユーザー登録自体は成功させたいので、エラーは warn のみ。
sub seed_examples {
    my ($dbh, $uid) = @_;
    my $base = $ENV{SCRIPT_FILENAME} || '';
    $base =~ s#/[^/]*$##;   # api.cgi のあるディレクトリ
    for my $f ('default_example_Japan.sql', 'default_example_USA.sql') {
        my $path = "$base/ddl/$f";
        open my $fh, '<:encoding(UTF-8)', $path or do { warn "seed_examples: open $path failed: $!\n"; next };
        local $/; my $sql = <$fh>; close $fh;
        $sql =~ s/:uid\b/$uid/g;   # uid は整数
        eval { $dbh->do($sql); 1 } or warn "seed_examples: exec $f failed: $@\n";
    }
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

# 期限切れセッションを掃除する（ログイン/登録時の「ついで掃除」。テーブル肥大化を防ぐ）。
# 失敗してもログイン処理自体は止めないよう、エラーは warn のみにする。
sub purge_expired_sessions {
    my ($dbh) = @_;
    eval { $dbh->do('DELETE FROM sessions WHERE expires_at < now()'); 1 }
        or warn "purge_expired_sessions failed: $@\n";
}

# 期限切れのサインアップ用トークンを掃除する（ついで掃除）。
sub purge_expired_signup_tokens {
    my ($dbh) = @_;
    eval { $dbh->do('DELETE FROM signup_tokens WHERE expires_at < now()'); 1 }
        or warn "purge_expired_signup_tokens failed: $@\n";
}

# ---- メール（サインアップ確認リンク） --------------------------------------
# アプリのベース URL（api.cgi のあるディレクトリ）を、リクエストの host/scheme から組み立てる。
# これにより dev（/~sugawara/nenpyo/）でも本番でも、その環境に合ったリンクになる。
sub app_base_url {
    my $scheme = ($ENV{HTTPS} && lc $ENV{HTTPS} eq 'on') ? 'https'
               : ($ENV{REQUEST_SCHEME} || 'https');
    my $host = $ENV{HTTP_HOST} || 'localhost';
    my $base = $ENV{SCRIPT_NAME} || '/';
    $base =~ s#/[^/]*$#/#;            # 末尾の api.cgi を取り除く
    return "$scheme://$host$base";
}

# 日本語のヘッダ値（Subject 等）を MIME エンコードワードにする。
sub mime_word {
    my ($s) = @_;
    utf8::encode($s) if utf8::is_utf8($s);
    return '=?UTF-8?B?' . MIME::Base64::encode_base64($s, '') . '?=';
}

# 確認リンクのメールを送る。宛先 $to はサインアップ申請時に書式検証済み（改行・空白なし）。
# 送信失敗時は 0 を返す（呼び出し側で扱う）。
sub send_signup_email {
    my ($to, $url) = @_;
    # 件名・本文とも、同じ内容を英語→日本語の順で併記する。
    my $subject = mime_word('Your nenpyo sign-up link / 【nenpyo】登録用リンクのお知らせ');
    my $body = "Thank you for signing up for nenpyo.\n"
             . "Open the link below and set your username and password to complete your registration.\n"
             . "(This link is valid for ${SIGNUP_TOKEN_HOURS} hour(s) only.)\n\n"
             . "$url\n\n"
             . "If you did not request this email, please ignore it.\n"
             . "\n----------------------------------------\n\n"
             . "nenpyo への登録ありがとうございます。\n"
             . "下記のリンクを開き、ユーザー名とパスワードを設定すると登録が完了します。\n"
             . "（このリンクは ${SIGNUP_TOKEN_HOURS} 時間のみ有効です）\n\n"
             . "$url\n\n"
             . "このメールに心当たりがない場合は、破棄してください。\n";
    utf8::encode($body) if utf8::is_utf8($body);
    my $ok = eval {
        open(my $mh, '|-', '/usr/sbin/sendmail', '-t', '-i') or die "sendmail: $!";
        print $mh "From: nenpyo <$MAIL_FROM>\r\n";
        print $mh "To: $to\r\n";
        print $mh "Subject: $subject\r\n";
        print $mh "MIME-Version: 1.0\r\n";
        print $mh "Content-Type: text/plain; charset=\"UTF-8\"\r\n";
        print $mh "Content-Transfer-Encoding: base64\r\n";
        print $mh "\r\n";
        print $mh MIME::Base64::encode_base64($body);
        close($mh) or die "sendmail close: $!";
        1;
    };
    warn "send_signup_email failed: $@\n" unless $ok;
    return $ok ? 1 : 0;
}

# 現在のログインユーザー {id, username, email} を返す。未ログインなら undef。
sub current_user {
    my ($dbh) = @_;
    my $token = get_cookie($COOKIE_NAME);
    return undef unless defined $token && $token =~ /^[0-9a-f]{16,128}$/;
    my $row = $dbh->selectrow_hashref(
        'SELECT u.id, u.username, u.email FROM sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.token = ? AND s.expires_at > now()',
        undef, $token
    );
    return $row;
}

sub require_user {
    my ($dbh) = @_;
    my $u = current_user($dbh);
    fail('not_authenticated', '401 Unauthorized') unless $u;
    return $u;
}

# ---- 出来事 ----------------------------------------------------------------
# うるう年判定（1582年より前はユリウス暦、以降はグレゴリオ暦）と月の日数（日の検証用）。
sub is_leap {
    my $y = shift;
    return ($y % 4 == 0) ? 1 : 0 if $y < 1582;                       # ユリウス暦
    (($y % 4 == 0 && $y % 100 != 0) || $y % 400 == 0) ? 1 : 0;       # グレゴリオ暦
}
sub days_in_month {
    my ($y, $m) = @_;
    my @ml = (31, is_leap($y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31);
    return $ml[$m - 1];
}

# 年月日の3つ組を検証。$field は 'start' / 'end'（エラーコードの補間に使う）。
# year_required が真なら年は必須。年が無ければ (undef,undef,undef) を返す。
sub clean_date {
    my ($field, $y, $mo, $d, $required) = @_;
    my $p = { field => $field };
    my ($year, $month, $day);
    if (defined $y && "$y" ne '') {
        fail('date_year_invalid', undef, $p) unless "$y" =~ /^-?\d+$/;
        $year = 0 + $y;
        # 先史時代（縄文=前14000年頃など）も扱えるよう下限を広く取る
        fail('date_year_range', undef, $p) if $year < -1000000 || $year > 9999;
        # 西暦0年は存在しない（1BCの翌日はAD1）。紀元前は負、紀元後は正で指定する。
        fail('year_zero') if $year == 0;
    } else {
        fail('date_year_required', undef, $p) if $required;
        return (undef, undef, undef);
    }
    if (defined $mo && "$mo" ne '') {
        fail('date_month_invalid', undef, $p) unless "$mo" =~ /^\d+$/ && $mo >= 1 && $mo <= 12;
        $month = 0 + $mo;
    }
    if (defined $d && "$d" ne '') {
        fail('date_day_needs_month', undef, $p) unless defined $month;
        fail('date_day_invalid', undef, $p) unless "$d" =~ /^\d+$/;
        my $dim = days_in_month($year, $month);
        fail('date_day_range', undef, { field => $field, month => 0 + $month, max => 0 + $dim })
            unless $d >= 1 && $d <= $dim;
        $day = 0 + $d;
    }
    return ($year, $month, $day);
}

# 入力を検証して (sy,sm,sd, ey,em,ed, title,detail) に正規化
sub clean_event {
    my ($body) = @_;
    my ($sy, $sm, $sd) = clean_date('start', $body->{start_year}, $body->{start_month}, $body->{start_day}, 1);
    my ($ey, $em, $ed) = clean_date('end',   $body->{end_year},   $body->{end_month},   $body->{end_day},   0);

    my $title  = defined $body->{title}  ? $body->{title}  : '';
    my $detail = defined $body->{detail} ? $body->{detail} : '';
    $title =~ s/\r//g; $title =~ s/\n/ /g;
    fail('title_too_long')  if length($title) > 100;
    fail('detail_too_long') if length($detail) > 1000;

    return ($sy, $sm, $sd, $ey, $em, $ed, $title, $detail);
}

my $EVENT_COLS = "id, start_year, start_month, start_day, end_year, end_month, end_day, title, detail, nenpyo_id, ongoing,
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
# PostgreSQL の真偽値（1/0 でも 't'/'f' でも）を JSON 真偽へ。
sub pgbool { my $v = $_[0]; (defined $v && $v ne '' && $v ne '0' && lc $v ne 'f') ? JSON::PP::true : JSON::PP::false }

# 与えられた値が本人の年表 id なら数値で返す。そうでなければ undef（未所属）。
sub owned_nenpyo_id {
    my ($dbh, $user_id, $val) = @_;
    return undef unless defined $val && "$val" =~ /^\d+$/;
    my $ok = $dbh->selectrow_array('SELECT 1 FROM nenpyo WHERE id=? AND user_id=?', undef, 0 + $val, $user_id);
    return $ok ? 0 + $val : undef;
}

# DB の文字列を数値/JSON 型に整える
sub event_json {
    my ($r) = @_;
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
        nenpyo_id   => numornull($r->{nenpyo_id}),
        ongoing     => pgbool($r->{ongoing}),
        readonly    => ($r->{readonly} ? JSON::PP::true : JSON::PP::false), # フォロー取込みは編集不可
        created     => 0 + ($r->{created} // 0),
        updated     => 0 + ($r->{updated} // 0),
    };
}

# 年表入力の検証。(name, color) を返す。
sub clean_tag {
    my ($body) = @_;
    my $name = defined $body->{name} ? $body->{name} : '';
    $name =~ s/^\s+|\s+$//g;
    $name =~ s/[\r\n]/ /g;
    fail('timeline_name_required') if $name eq '';
    fail('timeline_name_too_long') if length($name) > 40;
    my $color = defined $body->{color} && "$body->{color}" ne '' ? $body->{color} : '#9a6b3f';
    fail('invalid_color') unless $color =~ /^#[0-9a-fA-F]{6}$/;
    return ($name, lc $color);
}

sub tag_json {
    my ($r) = @_;
    return {
        id    => 0 + $r->{id},
        name  => $r->{name},
        color => $r->{color},
        sort_order => 0 + ($r->{sort_order} // 0),
        virtual_nenpyo_id => numornull($r->{virtual_nenpyo_id}), # フォロー取込みなら先 id、自分の年表は null
        virtual_dead => ($r->{virtual_dead} ? JSON::PP::true : JSON::PP::false), # フォロー先が削除済み
        owner => $r->{owner}, # フォロー先の所有者名（自分の年表・削除済みは null）
    };
}

# 年表一覧（自分の全行＝普通年表＋フォロー取込み）。virtual_dead/owner も付ける。
sub list_tags_json {
    my ($dbh, $user_id) = @_;
    my $rows = $dbh->selectall_arrayref(
        'SELECT n.id, n.name, n.color, n.sort_order, n.virtual_nenpyo_id,
                (n.virtual_nenpyo_id IS NOT NULL AND t.id IS NULL) AS virtual_dead,
                ou.username AS owner
           FROM nenpyo n
           LEFT JOIN nenpyo t ON t.id = n.virtual_nenpyo_id
           LEFT JOIN users  ou ON ou.id = t.user_id
          WHERE n.user_id = ?
          ORDER BY n.sort_order, n.id',
        { Slice => {} }, $user_id
    );
    return [ map { tag_json($_) } @$rows ];
}

# ---- ルーティング ----------------------------------------------------------
my $method = uc($ENV{REQUEST_METHOD} || 'GET');
my $action = query_param('action') || '';

eval {
    # 環境名（dev / production など）は DB 不要で返せるよう、接続前に処理する。
    if ($action eq 'env' && $method eq 'GET') {
        respond({ env => $NENPYO_ENV });
    }

    my $dbh = db();

    if ($action eq 'signup_request' && $method eq 'POST') {
        # サインアップ申請: メールを受け取り、確認リンクを送る（まだアカウントは作らない）。
        my $body = read_body_json();
        my $email = defined $body->{email} ? $body->{email} : '';
        $email =~ s/^\s+|\s+$//g;
        fail('email_required') if $email eq '';
        fail('email_invalid')  if length($email) > 254 || $email !~ /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
        # 既に登録済みのメールなら、リンクは送らず「使用済み」を返す。
        respond({ error => 'duplicate', fields => ['email'] }, '409 Conflict')
            if $dbh->selectrow_array('SELECT 1 FROM users WHERE lower(email) = lower(?)', undef, $email);

        # 同じメール宛の古いトークンは破棄し、新しいトークンを発行する。
        $dbh->do('DELETE FROM signup_tokens WHERE lower(email) = lower(?)', undef, $email);
        my $token = random_hex(32);
        $dbh->do(
            "INSERT INTO signup_tokens (token, email, expires_at)
             VALUES (?,?, now() + interval '$SIGNUP_TOKEN_HOURS hours')",
            undef, $token, $email
        );
        purge_expired_signup_tokens($dbh);
        my $url = app_base_url() . "?signup=$token";
        send_signup_email($email, $url) or fail('mail_failed', '500 Internal Server Error');
        respond({ ok => JSON::PP::true });
    }
    elsif ($action eq 'signup_verify' && $method eq 'GET') {
        # リンクのトークンを検証し、対応するメールを返す（Sign up 2 画面の表示用）。
        my $token = query_param('token') || '';
        my $row = $dbh->selectrow_hashref(
            'SELECT email FROM signup_tokens WHERE token = ? AND expires_at > now()',
            undef, $token
        );
        fail('signup_token_invalid', '400 Bad Request') unless $row;
        respond({ email => $row->{email} });
    }
    elsif ($action eq 'signup_complete' && $method eq 'POST') {
        # Sign up 2 の送信: トークン＋ユーザー名/パスワードでアカウントを作成する。
        my $body = read_body_json();
        my $token    = defined $body->{token}    ? $body->{token}    : '';
        my $username = defined $body->{username} ? $body->{username} : '';
        my $password = defined $body->{password} ? $body->{password} : '';
        $username =~ s/^\s+|\s+$//g;

        my $email = $dbh->selectrow_array(
            'SELECT email FROM signup_tokens WHERE token = ? AND expires_at > now()',
            undef, $token
        );
        fail('signup_token_invalid', '400 Bad Request') unless defined $email;

        fail('username_length') if $username eq '' || length($username) > 50;
        fail('password_too_short') if length($password) < 4;
        fail('password_too_long') if length($password) > 128;

        # 申請〜確定の間に同じメール/ユーザー名が使われていないか再確認する。
        my @taken;
        push @taken, 'email'
            if $dbh->selectrow_array('SELECT 1 FROM users WHERE lower(email) = lower(?)', undef, $email);
        push @taken, 'username'
            if $dbh->selectrow_array('SELECT 1 FROM users WHERE username = ?', undef, $username);
        respond({ error => 'duplicate', fields => \@taken }, '409 Conflict') if @taken;

        my $salt = random_hex(16);
        my $hash = pbkdf2($password, $salt, $PBKDF2_ITER);
        my $uid  = $dbh->selectrow_array(
            'INSERT INTO users (username, email, password_hash, salt, iterations)
             VALUES (?,?,?,?,?) RETURNING id',
            undef, $username, $email, $hash, $salt, $PBKDF2_ITER
        );
        seed_examples($dbh, $uid);   # サンプル年表（日本 / USA）を作成
        # 使い終わったトークン（同じメール宛のものも含めて）を削除する。
        $dbh->do('DELETE FROM signup_tokens WHERE lower(email) = lower(?)', undef, $email);
        my $stoken = random_hex(32);
        $dbh->do(
            "INSERT INTO sessions (token, user_id, expires_at)
             VALUES (?,?, now() + interval '$SESSION_DAYS days')",
            undef, $stoken, $uid
        );
        purge_expired_sessions($dbh);
        set_session_cookie($stoken);
        respond({ username => $username, email => $email });
    }
    elsif ($action eq 'login' && $method eq 'POST') {
        my $body = read_body_json();
        my $email    = defined $body->{email}    ? $body->{email}    : '';
        my $password = defined $body->{password} ? $body->{password} : '';
        $email =~ s/^\s+|\s+$//g;
        # メールアドレスでログイン（大文字小文字を無視）。
        my $u = $dbh->selectrow_hashref(
            'SELECT id, username, email, password_hash, salt, iterations FROM users WHERE lower(email) = lower(?)',
            undef, $email
        );
        fail('invalid_credentials', '401 Unauthorized') unless $u;
        my $hash = pbkdf2($password, $u->{salt}, $u->{iterations});
        fail('invalid_credentials', '401 Unauthorized')
            unless const_eq($hash, $u->{password_hash});

        my $token = random_hex(32);
        $dbh->do(
            "INSERT INTO sessions (token, user_id, expires_at)
             VALUES (?,?, now() + interval '$SESSION_DAYS days')",
            undef, $token, $u->{id}
        );
        purge_expired_sessions($dbh);   # ついで掃除（期限切れセッションを削除）
        set_session_cookie($token);
        respond({ username => $u->{username}, email => $u->{email} });
    }
    elsif ($action eq 'logout' && $method eq 'POST') {
        my $token = get_cookie($COOKIE_NAME);
        $dbh->do('DELETE FROM sessions WHERE token = ?', undef, $token)
            if defined $token && $token =~ /^[0-9a-f]+$/;
        clear_session_cookie();
        respond({ ok => JSON::PP::true });
    }
    elsif ($action eq 'change_password' && $method eq 'POST') {
        my $u = require_user($dbh);
        my $body = read_body_json();
        my $current = defined $body->{current_password} ? $body->{current_password} : '';
        my $new     = defined $body->{new_password}     ? $body->{new_password}     : '';
        # 現在のパスワードを確認（保存済みの salt/iterations で照合）。
        my $row = $dbh->selectrow_hashref(
            'SELECT password_hash, salt, iterations FROM users WHERE id = ?',
            undef, $u->{id}
        );
        fail('not_found', '404 Not Found') unless $row;
        my $cur_hash = pbkdf2($current, $row->{salt}, $row->{iterations});
        fail('current_password_wrong', '403 Forbidden')
            unless const_eq($cur_hash, $row->{password_hash});
        # 新しいパスワードを検証して、新しい salt で作り直して保存する。
        fail('password_too_short') if length($new) < 4;
        fail('password_too_long')  if length($new) > 128;
        my $salt = random_hex(16);
        my $hash = pbkdf2($new, $salt, $PBKDF2_ITER);
        $dbh->do(
            'UPDATE users SET password_hash = ?, salt = ?, iterations = ? WHERE id = ?',
            undef, $hash, $salt, $PBKDF2_ITER, $u->{id}
        );
        respond({ ok => JSON::PP::true });
    }
    elsif ($action eq 'account' && $method eq 'DELETE') {
        my $u = require_user($dbh);
        # users を消すと events / nenpyo / sessions は ON DELETE CASCADE で道連れに削除される。
        # （他人がこの年表をフォローしていた仮想年表は、既存仕様どおり名前だけ残って無効化される。）
        $dbh->do('DELETE FROM users WHERE id = ?', undef, $u->{id});
        clear_session_cookie();
        respond({ ok => JSON::PP::true });
    }
    elsif ($action eq 'dev_users' && $method eq 'GET') {
        # 開発用: 全ユーザーの一覧。開発環境でのみ有効（本番では存在しない扱い）。
        fail('not_found', '404 Not Found') unless $NENPYO_ENV eq 'development';
        require_user($dbh);
        my $rows = $dbh->selectall_arrayref(
            'SELECT u.id, u.username, u.email, u.created_at,
                    (SELECT count(*) FROM nenpyo n WHERE n.user_id = u.id AND n.virtual_nenpyo_id IS NULL) AS nenpyo_count,
                    (SELECT count(*) FROM events e WHERE e.user_id = u.id) AS event_count
               FROM users u ORDER BY u.id',
            { Slice => {} }
        );
        my @out = map {
            +{
                id           => 0 + $_->{id},
                username     => $_->{username},
                email        => $_->{email},
                created_at   => $_->{created_at},
                nenpyo_count => 0 + $_->{nenpyo_count},
                event_count  => 0 + $_->{event_count},
            }
        } @$rows;
        respond(\@out);
    }
    elsif ($action eq 'dev_user_timeline' && $method eq 'GET') {
        # 開発用: 指定ユーザーの年表（nenpyo）とイベント一覧。開発環境のみ。
        fail('not_found', '404 Not Found') unless $NENPYO_ENV eq 'development';
        require_user($dbh);
        my $uid = query_param('id');
        fail('invalid_id') unless defined $uid && $uid =~ /^\d+$/;
        my $uname = $dbh->selectrow_array('SELECT username FROM users WHERE id = ?', undef, $uid);
        fail('not_found', '404 Not Found') unless defined $uname;
        # 自分の年表（フォロー取込みの仮想年表は除く）。
        my $nen = $dbh->selectall_arrayref(
            'SELECT id, name, color FROM nenpyo
              WHERE user_id = ? AND virtual_nenpyo_id IS NULL
              ORDER BY sort_order, id',
            { Slice => {} }, $uid
        );
        my $evs = $dbh->selectall_arrayref(
            'SELECT id, nenpyo_id, start_year, start_month, start_day,
                    end_year, end_month, end_day, ongoing, title, detail
               FROM events WHERE user_id = ?
              ORDER BY start_year, start_month NULLS FIRST, start_day NULLS FIRST, id',
            { Slice => {} }, $uid
        );
        my @nlist = map { +{ id => 0 + $_->{id}, name => $_->{name}, color => $_->{color} } } @$nen;
        my @elist = map {
            +{
                id          => 0 + $_->{id},
                nenpyo_id   => numornull($_->{nenpyo_id}),
                start_year  => 0 + $_->{start_year},
                start_month => numornull($_->{start_month}),
                start_day   => numornull($_->{start_day}),
                end_year    => numornull($_->{end_year}),
                end_month   => numornull($_->{end_month}),
                end_day     => numornull($_->{end_day}),
                ongoing     => pgbool($_->{ongoing}),
                title       => $_->{title},
                detail      => $_->{detail},
            }
        } @$evs;
        respond({ username => $uname, nenpyo => \@nlist, events => \@elist });
    }
    elsif ($action eq 'color_schemes' && $method eq 'GET') {
        # 配色パターン一覧（color_scheme + colors）。設定画面のテーマ選択と開発用配色画面で使う。
        require_user($dbh);
        my $schemes = $dbh->selectall_arrayref(
            'SELECT id, name FROM color_scheme ORDER BY sort_order, id',
            { Slice => {} }
        );
        my $cols = $dbh->selectall_arrayref(
            'SELECT id, scheme_id, color FROM colors ORDER BY scheme_id, sort_order, id',
            { Slice => {} }
        );
        my %by_scheme;
        for my $c (@$cols) {
            push @{ $by_scheme{ $c->{scheme_id} } },
                +{ id => 0 + $c->{id}, color => $c->{color} };
        }
        my @out = map {
            +{
                id     => 0 + $_->{id},
                name   => $_->{name},
                colors => ($by_scheme{ $_->{id} } // []),
            }
        } @$schemes;
        respond(\@out);
    }
    elsif ($action eq 'dev_color_scheme' && $method eq 'PUT') {
        # 開発用: 配色名を更新。開発環境のみ。
        fail('not_found', '404 Not Found') unless $NENPYO_ENV eq 'development';
        require_user($dbh);
        my $id = query_param('id');
        fail('invalid_id') unless defined $id && $id =~ /^\d+$/;
        my $name = read_body_json()->{name};
        $name = defined $name ? $name : '';
        $name =~ s/^\s+|\s+$//g;
        $name =~ s/[\r\n]/ /g;
        fail('scheme_name_required') if $name eq '';
        fail('scheme_name_too_long') if length($name) > 40;
        my $n = $dbh->do('UPDATE color_scheme SET name=? WHERE id=?', undef, $name, $id);
        fail('not_found', '404 Not Found') unless $n && $n != 0;
        respond({ id => 0 + $id, name => $name });
    }
    elsif ($action eq 'dev_color' && $method eq 'PUT') {
        # 開発用: 配色内の1色を更新。開発環境のみ。
        fail('not_found', '404 Not Found') unless $NENPYO_ENV eq 'development';
        require_user($dbh);
        my $id = query_param('id');
        fail('invalid_id') unless defined $id && $id =~ /^\d+$/;
        my $color = read_body_json()->{color};
        $color = defined $color ? "$color" : '';
        fail('invalid_color') unless $color =~ /^#[0-9a-fA-F]{6}$/;
        $color = lc $color;
        my $n = $dbh->do('UPDATE colors SET color=? WHERE id=?', undef, $color, $id);
        fail('not_found', '404 Not Found') unless $n && $n != 0;
        respond({ id => 0 + $id, color => $color });
    }
    elsif ($action eq 'dev_color_schemes_reorder' && $method eq 'POST') {
        # 開発用: 配色の並び順を配列順に更新。開発環境のみ。
        fail('not_found', '404 Not Found') unless $NENPYO_ENV eq 'development';
        require_user($dbh);
        my $ids = read_body_json()->{ids};
        fail('ids_not_array') unless ref $ids eq 'ARRAY';
        my $sth = $dbh->prepare('UPDATE color_scheme SET sort_order=? WHERE id=?');
        my $pos = 0;
        for my $sid (@$ids) {
            next unless defined $sid && "$sid" =~ /^\d+$/;
            $pos++;
            $sth->execute($pos, 0 + $sid);
        }
        respond({ ok => JSON::PP::true });
    }
    elsif ($action eq 'dev_color_scheme_copy' && $method eq 'POST') {
        # 開発用: 既存の配色を複製して新規作成（色もそのままコピー）。開発環境のみ。
        fail('not_found', '404 Not Found') unless $NENPYO_ENV eq 'development';
        require_user($dbh);
        my $id = query_param('id');
        fail('invalid_id') unless defined $id && $id =~ /^\d+$/;
        my $src = $dbh->selectrow_hashref('SELECT id, name FROM color_scheme WHERE id=?', undef, $id);
        fail('not_found', '404 Not Found') unless $src;
        my $cols = $dbh->selectall_arrayref(
            'SELECT color, sort_order FROM colors WHERE scheme_id=? ORDER BY sort_order, id',
            { Slice => {} }, $id
        );
        my $name = $src->{name} . ' のコピー';
        my $maxord = $dbh->selectrow_array('SELECT COALESCE(MAX(sort_order), 0) FROM color_scheme');
        my $new_id;
        $dbh->begin_work;
        eval {
            $new_id = $dbh->selectrow_array(
                'INSERT INTO color_scheme (name, sort_order) VALUES (?, ?) RETURNING id',
                undef, $name, $maxord + 1
            );
            my $ins = $dbh->prepare('INSERT INTO colors (scheme_id, color, sort_order) VALUES (?, ?, ?)');
            for my $c (@$cols) {
                $ins->execute($new_id, $c->{color}, $c->{sort_order});
            }
            $dbh->commit;
            1;
        } or do {
            eval { $dbh->rollback };
            fail('copy_failed', '500 Internal Server Error');
        };
        my $newcols = $dbh->selectall_arrayref(
            'SELECT id, color FROM colors WHERE scheme_id=? ORDER BY sort_order, id',
            { Slice => {} }, $new_id
        );
        respond({
            id     => 0 + $new_id,
            name   => $name,
            colors => [ map { +{ id => 0 + $_->{id}, color => $_->{color} } } @$newcols ],
        });
    }
    elsif ($action eq 'me' && $method eq 'GET') {
        my $u = current_user($dbh);
        fail('not_authenticated', '401 Unauthorized') unless $u;
        respond({ username => $u->{username}, email => $u->{email} });
    }
    elsif ($action eq 'events' && $method eq 'GET') {
        my $u = require_user($dbh);
        # 自分のイベント（編集可）。
        my $own = $dbh->selectall_arrayref(
            "SELECT $EVENT_COLS, FALSE AS readonly FROM events WHERE user_id = ?",
            { Slice => {} }, $u->{id}
        );
        # フォロー取込み（仮想年表）のイベント。フォロー先のイベントを、自分の仮想年表 id に
        # 付け替えて読み取り専用で混ぜる。フォロー先が削除済みなら何も出ない。
        my $virt = $dbh->selectall_arrayref(
            "SELECT e.id, e.start_year, e.start_month, e.start_day,
                    e.end_year, e.end_month, e.end_day, e.title, e.detail,
                    n.id AS nenpyo_id, e.ongoing, TRUE AS readonly,
                    extract(epoch FROM e.created_at)::bigint AS created,
                    extract(epoch FROM e.updated_at)::bigint AS updated
               FROM nenpyo n
               JOIN events e ON e.nenpyo_id = n.virtual_nenpyo_id
              WHERE n.user_id = ? AND n.virtual_nenpyo_id IS NOT NULL",
            { Slice => {} }, $u->{id}
        );
        my @all = sort {
               $a->{start_year} <=> $b->{start_year}
            || ($a->{start_month} // -1) <=> ($b->{start_month} // -1)
            || ($a->{start_day}   // -1) <=> ($b->{start_day}   // -1)
            || $a->{id} <=> $b->{id}
        } (@$own, @$virt);
        respond([ map { event_json($_) } @all ]);
    }
    elsif ($action eq 'event' && $method eq 'POST') {
        my $u = require_user($dbh);
        my $body = read_body_json();
        my ($sy, $sm, $sd, $ey, $em, $ed, $title, $detail) = clean_event($body);
        my $nid = owned_nenpyo_id($dbh, $u->{id}, $body->{nenpyo_id});
        my $ongoing = $body->{ongoing} ? 1 : 0;
        ($ey, $em, $ed) = (undef, undef, undef) if $ongoing; # 継続中なら終了は持たない
        my $id = $dbh->selectrow_array(
            'INSERT INTO events (user_id, start_year, start_month, start_day, end_year, end_month, end_day, title, detail, nenpyo_id, ongoing)
             VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id',
            undef, $u->{id}, $sy, $sm, $sd, $ey, $em, $ed, $title, $detail, $nid, $ongoing
        );
        respond(event_json(event_row($dbh, $u->{id}, $id)));
    }
    elsif ($action eq 'event' && $method eq 'PUT') {
        my $u  = require_user($dbh);
        my $id = query_param('id');
        fail('invalid_id') unless defined $id && $id =~ /^\d+$/;
        fail('not_found', '404 Not Found') unless event_row($dbh, $u->{id}, $id);
        my $body = read_body_json();
        my ($sy, $sm, $sd, $ey, $em, $ed, $title, $detail) = clean_event($body);
        my $nid = owned_nenpyo_id($dbh, $u->{id}, $body->{nenpyo_id});
        my $ongoing = $body->{ongoing} ? 1 : 0;
        ($ey, $em, $ed) = (undef, undef, undef) if $ongoing; # 継続中なら終了は持たない
        $dbh->do(
            'UPDATE events SET start_year=?, start_month=?, start_day=?,
                               end_year=?, end_month=?, end_day=?,
                               title=?, detail=?, nenpyo_id=?, ongoing=?, updated_at=now()
              WHERE id=? AND user_id=?',
            undef, $sy, $sm, $sd, $ey, $em, $ed, $title, $detail, $nid, $ongoing, $id, $u->{id}
        );
        respond(event_json(event_row($dbh, $u->{id}, $id)));
    }
    elsif ($action eq 'event' && $method eq 'DELETE') {
        my $u  = require_user($dbh);
        my $id = query_param('id');
        fail('invalid_id') unless defined $id && $id =~ /^\d+$/;
        $dbh->do('DELETE FROM events WHERE id=? AND user_id=?', undef, $id, $u->{id});
        respond({ ok => JSON::PP::true });
    }
    elsif ($action eq 'tags' && $method eq 'GET') {
        my $u = require_user($dbh);
        respond(list_tags_json($dbh, $u->{id}));
    }
    elsif ($action eq 'explore' && $method eq 'GET') {
        # 他ユーザーの年表と、それに含まれるイベントを返す（全公開。自分の年表は除く）。
        my $u = require_user($dbh);
        # フォロー済み = 自分の仮想年表が指すフォロー先 id の集合。
        my %followed = map { $_ => 1 }
            @{ $dbh->selectcol_arrayref('SELECT virtual_nenpyo_id FROM nenpyo WHERE user_id=? AND virtual_nenpyo_id IS NOT NULL', undef, $u->{id}) };
        # 公開対象は「普通の年表」のみ（フォロー取込みの仮想年表は出さない）。
        my $rows = $dbh->selectall_arrayref(
            'SELECT t.id AS tag_id, t.name AS tag_name, t.color, u.username,
                    e.id AS event_id, e.start_year, e.start_month, e.start_day,
                    e.end_year, e.end_month, e.end_day, e.title, e.detail, e.ongoing
               FROM nenpyo t
               JOIN users u ON u.id = t.user_id
               JOIN events e ON e.nenpyo_id = t.id
              WHERE t.user_id <> ? AND t.virtual_nenpyo_id IS NULL
              ORDER BY u.username, t.sort_order, t.id,
                       e.start_year, e.start_month NULLS FIRST, e.start_day NULLS FIRST, e.id',
            { Slice => {} }, $u->{id}
        );
        my (@list, %idx);
        for my $r (@$rows) {
            my $tid = 0 + $r->{tag_id};
            unless (exists $idx{$tid}) {
                push @list, {
                    tag_id => $tid, name => $r->{tag_name},
                    color => $r->{color}, username => $r->{username}, events => [],
                    followed => $followed{$tid} ? JSON::PP::true : JSON::PP::false,
                };
                $idx{$tid} = $#list;
            }
            next unless defined $r->{event_id};
            push @{ $list[$idx{$tid}]{events} }, {
                id          => 0 + $r->{event_id},
                start_year  => 0 + $r->{start_year},
                start_month => numornull($r->{start_month}),
                start_day   => numornull($r->{start_day}),
                end_year    => numornull($r->{end_year}),
                end_month   => numornull($r->{end_month}),
                end_day     => numornull($r->{end_day}),
                title       => $r->{title},
                detail      => $r->{detail},
                ongoing     => pgbool($r->{ongoing}),
            };
        }
        respond(\@list);
    }
    elsif ($action eq 'tag' && $method eq 'POST') {
        my $u = require_user($dbh);
        # 新規の年表。並び順は末尾（最大+1）。
        my ($name, $color) = clean_tag(read_body_json());
        fail('timeline_name_taken', '409 Conflict')
            if $dbh->selectrow_array('SELECT 1 FROM nenpyo WHERE user_id=? AND name=? AND virtual_nenpyo_id IS NULL', undef, $u->{id}, $name);
        my $next = $dbh->selectrow_array('SELECT COALESCE(MAX(sort_order),0)+1 FROM nenpyo WHERE user_id=?', undef, $u->{id});
        my $row = $dbh->selectrow_hashref(
            'INSERT INTO nenpyo (user_id, name, color, sort_order) VALUES (?,?,?,?)
             RETURNING id, name, color, sort_order, virtual_nenpyo_id',
            undef, $u->{id}, $name, $color, $next
        );
        respond(tag_json($row));
    }
    elsif ($action eq 'tags_reorder' && $method eq 'POST') {
        my $u = require_user($dbh);
        my $body = read_body_json();
        my $ids = $body->{ids};
        fail('ids_not_array') unless ref $ids eq 'ARRAY';
        # 配列の並び順で sort_order を 1..n に振り直す（本人の年表のみ）。
        my $sth = $dbh->prepare('UPDATE nenpyo SET sort_order=? WHERE id=? AND user_id=?');
        my $pos = 0;
        for my $tid (@$ids) {
            next unless defined $tid && "$tid" =~ /^\d+$/;
            $pos++;
            $sth->execute($pos, 0 + $tid, $u->{id});
        }
        respond(list_tags_json($dbh, $u->{id}));
    }
    elsif ($action eq 'tag' && $method eq 'PUT') {
        my $u  = require_user($dbh);
        my $id = query_param('id');
        fail('invalid_id') unless defined $id && $id =~ /^\d+$/;
        fail('not_found', '404 Not Found')
            unless $dbh->selectrow_array('SELECT 1 FROM nenpyo WHERE id=? AND user_id=?', undef, $id, $u->{id});
        my $body = read_body_json();
        my ($name, $color) = clean_tag($body);
        # 一意性は「自分の普通年表どうし」だけで判定（フォロー名は重複可）。
        fail('timeline_name_taken', '409 Conflict')
            if $dbh->selectrow_array('SELECT 1 FROM nenpyo WHERE user_id=? AND name=? AND id<>? AND virtual_nenpyo_id IS NULL', undef, $u->{id}, $name, $id);
        $dbh->do('UPDATE nenpyo SET name=?, color=? WHERE id=? AND user_id=?',
            undef, $name, $color, $id, $u->{id});
        my $cur = $dbh->selectrow_hashref(
            'SELECT n.id, n.name, n.color, n.sort_order, n.virtual_nenpyo_id,
                    (n.virtual_nenpyo_id IS NOT NULL AND t.id IS NULL) AS virtual_dead,
                    ou.username AS owner
               FROM nenpyo n
               LEFT JOIN nenpyo t ON t.id = n.virtual_nenpyo_id
               LEFT JOIN users  ou ON ou.id = t.user_id
              WHERE n.id=? AND n.user_id=?',
            undef, $id, $u->{id});
        respond(tag_json($cur));
    }
    elsif ($action eq 'tag' && $method eq 'DELETE') {
        my $u  = require_user($dbh);
        my $id = query_param('id');
        fail('invalid_id') unless defined $id && $id =~ /^\d+$/;
        # with_events=1 のときは、年表に属するイベントも一緒に削除する。
        # （無指定なら従来どおり、イベントは ON DELETE SET NULL で未所属に残る）
        my $with = query_param('with_events');
        if (defined $with && $with eq '1') {
            $dbh->do('DELETE FROM events WHERE user_id=? AND nenpyo_id=?', undef, $u->{id}, $id);
        }
        $dbh->do('DELETE FROM nenpyo WHERE id=? AND user_id=?', undef, $id, $u->{id});
        respond({ ok => JSON::PP::true });
    }
    elsif ($action eq 'follow' && $method eq 'POST') {
        # 年表をフォローする = フォロー先の name/color をコピーした仮想年表行を自分に作る。
        # 自分の年表・仮想年表はフォロー不可。二重フォローは無視（冪等）。
        my $u   = require_user($dbh);
        my $nid = read_body_json()->{nenpyo_id};
        fail('invalid_nenpyo_id') unless defined $nid && "$nid" =~ /^\d+$/;
        $nid = 0 + $nid;
        my $tgt = $dbh->selectrow_hashref('SELECT user_id, name, color, virtual_nenpyo_id FROM nenpyo WHERE id=?', undef, $nid);
        fail('not_found', '404 Not Found') unless $tgt;
        fail('cannot_follow_own') if $tgt->{user_id} == $u->{id};
        fail('cannot_follow_virtual') if defined $tgt->{virtual_nenpyo_id}; # 取込みの取込みは不可
        unless ($dbh->selectrow_array('SELECT 1 FROM nenpyo WHERE user_id=? AND virtual_nenpyo_id=?', undef, $u->{id}, $nid)) {
            my $next = $dbh->selectrow_array('SELECT COALESCE(MAX(sort_order),0)+1 FROM nenpyo WHERE user_id=?', undef, $u->{id});
            $dbh->do('INSERT INTO nenpyo (user_id, name, color, sort_order, virtual_nenpyo_id) VALUES (?,?,?,?,?)',
                undef, $u->{id}, $tgt->{name}, $tgt->{color}, $next, $nid);
        }
        respond({ ok => JSON::PP::true });
    }
    elsif ($action eq 'follow' && $method eq 'DELETE') {
        # フォロー解除 = フォロー先 id を指す自分の仮想年表行を削除。
        my $u   = require_user($dbh);
        my $nid = query_param('nenpyo_id');
        fail('invalid_nenpyo_id') unless defined $nid && $nid =~ /^\d+$/;
        $dbh->do('DELETE FROM nenpyo WHERE user_id=? AND virtual_nenpyo_id=?', undef, $u->{id}, 0 + $nid);
        respond({ ok => JSON::PP::true });
    }
    else {
        fail('not_found', '404 Not Found');
    }
    1;
} or do {
    my $err = $@ || 'unknown error';
    warn "nenpyo api error: $err\n"; # 詳細はサーバーログへ。クライアントには汎用コードのみ返す。
    fail('server_error', '500 Internal Server Error');
};
