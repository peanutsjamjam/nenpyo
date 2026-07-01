-- colors: 配色パターンに含まれる個々の色。
--   scheme_id  … どの配色（color_scheme.id）に属するか。配色削除で CASCADE 削除。
--   color      … カラーコード "#rrggbb" 形式（アプリ側で検証）。
--   sort_order … 配色内での並び順（小さいほど先。パレットの色の順序）。
CREATE TABLE colors (
  id         SERIAL PRIMARY KEY,
  scheme_id  INTEGER NOT NULL REFERENCES color_scheme(id) ON DELETE CASCADE,
  color      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 配色ごとの色を並び順で取り出す用
CREATE INDEX colors_scheme_idx ON colors(scheme_id, sort_order);
