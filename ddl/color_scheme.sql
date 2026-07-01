-- color_scheme: 配色パターン（パレット）。全ユーザー共有のプリセット。
--   name       … 配色名（表示用）。
--   sort_order … 一覧での並び順（小さいほど先）。
--   実際の色は colors テーブルが scheme_id で参照する。
CREATE TABLE color_scheme (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
