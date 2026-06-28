-- 新規ユーザー用のサンプル年表「日本」を作成する。
-- :uid に対象ユーザーの id を入れて実行する。
--   psql:    psql -d nenpyo -v uid=<id> -f ddl/default_example_Japan.sql
--   api.cgi: 新規登録時に :uid をユーザー id に置換して実行する。
-- nenpyo と events を CTE で一括作成（1ステートメント）。
WITH t AS (
  INSERT INTO nenpyo (user_id, name, color, sort_order)
  VALUES (:uid, '日本', '#8eafaf',
          (SELECT COALESCE(MAX(sort_order),0)+1 FROM nenpyo WHERE user_id = :uid))
  RETURNING id
)
INSERT INTO events (user_id, start_year, start_month, start_day, end_year, end_month, end_day, ongoing, title, detail, nenpyo_id)
SELECT :uid, v.sy, v.sm, v.sd, v.ey, v.em, v.ed, v.ongoing, v.title, v.detail, t.id
FROM t, (VALUES
  (-14000, NULL::int, NULL::int, -400::int, NULL::int, NULL::int, false, '縄文', ''),
  (-400,  NULL, NULL,  250, NULL, NULL, false, '弥生', ''),
  (250,   NULL, NULL,  592, NULL, NULL, false, '古墳', '前方後円墳が各地に。ヤマト王権の時代。'),
  (592,   NULL, NULL,  710, NULL, NULL, false, '飛鳥', ''),
  (710,   NULL, NULL,  794, NULL, NULL, false, '奈良', ''),
  (794,   NULL, NULL, 1185, NULL, NULL, false, '平安', ''),
  (1185,  NULL, NULL, 1333, NULL, NULL, false, '鎌倉', ''),
  (1333,  NULL, NULL, 1336, NULL, NULL, false, '建武の新政', '後醍醐天皇による親政（鎌倉幕府滅亡〜室町幕府成立）。'),
  (1336,  NULL, NULL, 1573, NULL, NULL, false, '室町', ''),
  (1467,  NULL, NULL, 1590, NULL, NULL, false, '戦国時代', ''),
  (1573,  NULL, NULL, 1603, NULL, NULL, false, '安土桃山', ''),
  (1603,  NULL, NULL, 1868, NULL, NULL, false, '江戸', ''),
  (1868,  10,   23,   1912, 7,    30,   false, '明治', ''),
  (1912,  7,    30,   1926, 12,   25,   false, '大正', ''),
  (1926,  12,   25,   1989, 1,    7,    false, '昭和', ''),
  (1989,  1,    8,    2019, 4,    30,   false, '平成', ''),
  (2019,  5,    1,    NULL, NULL, NULL, true,  '令和', '')
) AS v(sy, sm, sd, ey, em, ed, ongoing, title, detail);
