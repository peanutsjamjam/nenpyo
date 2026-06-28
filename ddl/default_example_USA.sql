-- 新規ユーザー用のサンプル年表「United States of America」を作成する。
-- :uid に対象ユーザーの id を入れて実行する。
--   psql:    psql -d nenpyo -v uid=<id> -f ddl/default_example_USA.sql
--   api.cgi: 新規登録時に :uid をユーザー id に置換して実行する。
-- nenpyo と events を CTE で一括作成（1ステートメント）。
WITH t AS (
  INSERT INTO nenpyo (user_id, name, color, sort_order)
  VALUES (:uid, 'United States of America', '#2a4b8d',
          (SELECT COALESCE(MAX(sort_order),0)+1 FROM nenpyo WHERE user_id = :uid))
  RETURNING id
)
INSERT INTO events (user_id, start_year, end_year, title, detail, nenpyo_id)
SELECT :uid, v.sy, v.ey, v.title, v.detail, t.id
FROM t, (VALUES
  (1492, NULL::int, 'Columbus Reaches the Americas', 'Christopher Columbus lands in the Caribbean, opening the Americas to European contact.'),
  (1607, NULL, 'Founding of Jamestown', 'The first permanent English settlement in North America, in Virginia.'),
  (1620, NULL, 'Arrival of the Mayflower', 'Pilgrims establish Plymouth Colony in present-day Massachusetts.'),
  (1775, 1783, 'American Revolutionary War', 'The Thirteen Colonies fight for independence from Great Britain.'),
  (1776, NULL, 'Declaration of Independence', 'Adopted on July 4, declaring the colonies free from British rule.'),
  (1787, NULL, 'Drafting of the Constitution', 'The U.S. Constitution is written at the Philadelphia Convention.'),
  (1789, 1797, 'Presidency of George Washington', 'George Washington serves as the first President of the United States.'),
  (1803, NULL, 'Louisiana Purchase', 'The United States buys vast western territory from France, doubling its size.'),
  (1812, 1815, 'War of 1812', 'A conflict between the United States and Great Britain.'),
  (1848, NULL, 'California Gold Rush', 'The discovery of gold draws hundreds of thousands of settlers to the West.'),
  (1861, 1865, 'American Civil War', 'War between the Union and the Confederacy over slavery and secession.'),
  (1863, NULL, 'Emancipation Proclamation', 'President Lincoln declares the freedom of slaves in the Confederate states.'),
  (1869, NULL, 'Transcontinental Railroad Completed', 'The first railroad linking the east and west coasts is finished.'),
  (1898, NULL, 'Spanish-American War', 'The United States gains overseas territories including Puerto Rico and the Philippines.'),
  (1917, 1918, 'World War I', 'The United States enters the Great War on the side of the Allies.'),
  (1920, NULL, 'Women Gain the Right to Vote', 'The 19th Amendment grants American women the right to vote.'),
  (1929, 1939, 'The Great Depression', 'A severe economic downturn following the stock market crash of 1929.'),
  (1941, 1945, 'World War II', 'The United States joins the Allies after the attack on Pearl Harbor.'),
  (1947, 1991, 'The Cold War', 'Decades of geopolitical tension between the United States and the Soviet Union.'),
  (1955, 1968, 'Civil Rights Movement', 'A struggle to end racial segregation and discrimination against African Americans.'),
  (1969, NULL, 'Apollo 11 Moon Landing', 'American astronauts become the first humans to walk on the Moon.'),
  (2001, NULL, 'September 11 Attacks', 'Terrorist attacks on New York and Washington reshape U.S. security policy.')
) AS v(sy, ey, title, detail);
