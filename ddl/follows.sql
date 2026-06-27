-- follows: 「年表のフォロー」関係。
--   ある人(follower_user_id)が、別の人の Primeタグ(tag_id)の年表を
--   「自分のところで表示したい（＝フォローしている）」ことを表す。
--   対象タグの所有者は tags.user_id から辿れるので、ここには持たない。
--   tag_id は Prime タグを想定（prime かどうかの強制はアプリ側で行う）。
--   どちらかのユーザー／タグが消えたらフォローも消える（ON DELETE CASCADE）。
CREATE TABLE follows (
  follower_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag_id           INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_user_id, tag_id)   -- 同じタグを二重にフォローしない
);

-- 「このタグを誰がフォローしているか」「タグ削除時のカスケード」用
CREATE INDEX follows_tag_idx ON follows(tag_id);
