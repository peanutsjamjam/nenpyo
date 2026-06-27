-- nenpyo: ユーザーが作る「年表」。期間バーの色を持つ。
--   color は "#rrggbb" 形式（アプリ側で検証）。同一ユーザー内で name は一意。
--   sort_order は一覧での並び順（小さいほど先。ユーザーが上下で変更できる）。
--   （旧 tags テーブル。普通タグ／prime の区別は廃止し、全行が「年表」。）
CREATE TABLE nenpyo (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#9a6b3f',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
