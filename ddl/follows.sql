-- follows: 「年表のフォロー」関係。
--   ある人(follower_user_id)が、別の人の年表(tag_id = nenpyo.id)を
--   「自分のところで表示したい（＝フォローしている）」ことを表す。
--   対象年表の所有者は nenpyo.user_id から辿れるので、ここには持たない。
--   どちらかのユーザー／年表が消えたらフォローも消える（ON DELETE CASCADE）。
CREATE TABLE follows (
  follower_user_id INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  tag_id           INTEGER NOT NULL REFERENCES nenpyo(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_user_id, tag_id)   -- 同じ年表を二重にフォローしない
);

-- 「この年表を誰がフォローしているか」「年表削除時のカスケード」用
CREATE INDEX follows_tag_idx ON follows(tag_id);
