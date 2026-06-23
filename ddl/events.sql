-- events: 年表の出来事。開始(年月日)と終了(年月日)を持つ。
--   start_year は必須（負値=紀元前）。start_month/start_day は任意。
--   end_* はすべて任意（指定なし=単発の出来事。指定あり=期間のある出来事）。
--   日は月とともに、月は年とともに指定する（アプリ側で検証）。
CREATE TABLE events (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 西暦0年は存在しない（紀元前1年の翌日が西暦1年）。負=紀元前、正=紀元後。
  start_year  INTEGER NOT NULL CHECK (start_year <> 0),
  start_month SMALLINT CHECK (start_month BETWEEN 1 AND 12),
  start_day   SMALLINT CHECK (start_day   BETWEEN 1 AND 31),
  end_year    INTEGER CHECK (end_year <> 0),
  end_month   SMALLINT CHECK (end_month BETWEEN 1 AND 12),
  end_day     SMALLINT CHECK (end_day   BETWEEN 1 AND 31),
  title       TEXT NOT NULL DEFAULT '',
  detail      TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX events_user_order_idx
  ON events(user_id, start_year, start_month NULLS FIRST, start_day NULLS FIRST);
