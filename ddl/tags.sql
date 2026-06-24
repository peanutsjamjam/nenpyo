-- tags: ユーザーが作成するタグ。期間バーの色を持つ。
--   color は "#rrggbb" 形式（アプリ側で検証）。同一ユーザー内で name は一意。
CREATE TABLE tags (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#9a6b3f',
  prime      BOOLEAN NOT NULL DEFAULT false,
  -- 一覧での並び順（小さいほど先。現状はユーザーが prime 群の順序を変更できる）
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
