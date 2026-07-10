#!/usr/bin/perl
# 開発用シード: テストユーザー user1/user2/user3 と、その年表（nenpyo）＋イベントを作る。
#   - ログインはメールアドレス方式なので、各ユーザーに <username>@example.com の email を付与し、
#     アプリからログインできるようにする。パスワードは api.cgi と同じ PBKDF2-HMAC-SHA256(120000)。
#   - 3人とも同じ簡易パスワード（下の $PASSWORD）。
#   - 再実行すると同名ユーザーを一旦削除して作り直す（events/nenpyo は CASCADE で消える）。
#
# 実行（DBI を持つシステム perl で。peer 認証なのでパスワード不要）:
#   /usr/bin/perl ddl/seed_dev.pl
#
# 注意: 本番データには流さないこと。あくまでローカル/開発確認用。
use strict;
use warnings;
use utf8;
use DBI;
use Digest::SHA qw(hmac_sha256);

binmode STDOUT, ':encoding(UTF-8)';

# api.cgi と同じパスワード方式（PBKDF2-HMAC-SHA256, 120000回）
my $PBKDF2_ITER = 120000;
my $PASSWORD    = 'pass1234';   # 3人とも同じ（テスト用）

sub random_hex {
    my ($bytes) = @_;
    open my $fh, '<:raw', '/dev/urandom' or die "urandom: $!";
    read($fh, my $buf, $bytes);
    close $fh;
    return unpack('H*', $buf);
}

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

my $dbh = DBI->connect('dbi:Pg:dbname=nenpyo', '', '',
    { RaiseError => 1, AutoCommit => 0, pg_enable_utf8 => 1 });

# ----- 投入データ -----------------------------------------------------------
# 各ユーザー: created（過去日）, 年表[name,color], events[配列]
#   event = [sy,sm,sd, ey,em,ed, title, detail, [年表名...]]
my %seed = (
  user1 => {
    created => '2026-05-03 10:12:00+09',
    tags => [ ['日本史','#c0392b'], ['戦乱','#e67e22'] ],
    events => [
      [-14000,undef,undef, -300,undef,undef, '縄文時代', '狩猟採集と土器の時代。', ['日本史']],
      [-300,undef,undef, 250,undef,undef, '弥生時代', '稲作が広まる。', ['日本史']],
      [794,undef,undef, 1185,undef,undef, '平安時代', '貴族文化が栄える。', ['日本史']],
      [1467,undef,undef, 1477,undef,undef, '応仁の乱', '戦国時代の幕開け。', ['日本史','戦乱']],
      [1600,9,15, undef,undef,undef, '関ヶ原の戦い', '徳川家康が勝利。', ['戦乱']],
      [1603,undef,undef, 1868,undef,undef, '江戸時代', '徳川幕府の治世。', ['日本史']],
      [1868,undef,undef, 1912,undef,undef, '明治時代', '近代化と文明開化。', ['日本史']],
    ],
  },
  user2 => {
    created => '2026-05-10 21:40:00+09',
    tags => [ ['ヨーロッパ','#2e86de'], ['戦争','#8e44ad'] ],
    events => [
      [-27,undef,undef, 476,undef,undef, 'ローマ帝国', '地中海世界を支配。', ['ヨーロッパ']],
      [1300,undef,undef, 1600,undef,undef, 'ルネサンス', '芸術と学問の復興。', ['ヨーロッパ']],
      [1789,7,14, 1799,undef,undef, 'フランス革命', 'バスティーユ襲撃に始まる。', ['ヨーロッパ','戦争']],
      [1914,undef,undef, 1918,undef,undef, '第一次世界大戦', '総力戦の時代。', ['ヨーロッパ','戦争']],
      [1939,undef,undef, 1945,undef,undef, '第二次世界大戦', '世界規模の戦争。', ['戦争']],
    ],
  },
  user3 => {
    created => '2026-06-01 08:05:00+09',
    tags => [ ['科学史','#27ae60'], ['物理','#16a085'] ],
    events => [
      [1687,undef,undef, undef,undef,undef, '万有引力の法則', 'ニュートン『プリンキピア』。', ['科学史','物理']],
      [1769,undef,undef, undef,undef,undef, '蒸気機関の改良', 'ワットによる改良。', ['科学史']],
      [1879,undef,undef, undef,undef,undef, '白熱電球', 'エジソンが実用化。', ['科学史']],
      [1905,undef,undef, undef,undef,undef, '特殊相対性理論', 'アインシュタイン。', ['科学史','物理']],
      [1953,undef,undef, undef,undef,undef, 'DNA二重らせん', 'ワトソンとクリック。', ['科学史']],
      [1969,7,20, undef,undef,undef, '人類初の月面着陸', 'アポロ11号。', ['科学史']],
    ],
  },
);

for my $uname (sort keys %seed) {
  my $u = $seed{$uname};

  # 既存の同名ユーザーは削除（events/tags は CASCADE で消える）
  $dbh->do('DELETE FROM users WHERE username = ?', undef, $uname);

  my $salt  = random_hex(16);
  my $hash  = pbkdf2($PASSWORD, $salt, $PBKDF2_ITER);
  my $email = "$uname\@example.com";   # ログインはメール方式なので email を付与する
  my $uid  = $dbh->selectrow_array(
    'INSERT INTO users (username, email, password_hash, salt, iterations, created_at)
     VALUES (?,?,?,?,?,?) RETURNING id',
    undef, $uname, $email, $hash, $salt, $PBKDF2_ITER, $u->{created});

  # 年表（nenpyo）
  my %tagid;
  my $order = 0;
  for my $t (@{ $u->{tags} }) {
    $order++;
    my ($name, $color) = @$t;
    $tagid{$name} = $dbh->selectrow_array(
      'INSERT INTO nenpyo (user_id, name, color, sort_order, created_at)
       VALUES (?,?,?,?,?) RETURNING id',
      undef, $uid, $name, $color, $order, $u->{created});
  }

  # events（属する年表は1つ。複数列挙されていても先頭=sort_order最小を採用）
  for my $e (@{ $u->{events} }) {
    my ($sy,$sm,$sd,$ey,$em,$ed,$title,$detail,$tagnames) = @$e;
    my $nid = (ref $tagnames eq 'ARRAY' && @$tagnames) ? $tagid{$tagnames->[0]} : undef;
    $dbh->do(
      'INSERT INTO events
         (user_id, start_year, start_month, start_day, end_year, end_month, end_day,
          title, detail, nenpyo_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      undef, $uid, $sy,$sm,$sd,$ey,$em,$ed, $title, $detail, $nid, $u->{created}, $u->{created});
  }

  printf "%-6s id=%d  tags=%d  events=%d\n",
    $uname, $uid, scalar(@{$u->{tags}}), scalar(@{$u->{events}});
}

$dbh->commit;
$dbh->disconnect;
print "done. login: <username>\@example.com / password for all = '$PASSWORD'\n";
