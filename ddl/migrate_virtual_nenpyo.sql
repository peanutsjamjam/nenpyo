-- follows テーブルを廃止し、nenpyo.virtual_nenpyo_id へ移行するマイグレーション。
--   実行: psql -d nenpyo -f ddl/migrate_virtual_nenpyo.sql
--   1度きり。冪等ではないので再実行しないこと（follows が無ければ移行行はスキップされる）。
BEGIN;

-- 1) 列を追加（既にあれば何もしない）
ALTER TABLE nenpyo ADD COLUMN IF NOT EXISTS virtual_nenpyo_id INTEGER;
CREATE INDEX IF NOT EXISTS nenpyo_virtual_idx ON nenpyo(virtual_nenpyo_id);

-- 2) name の一意制約を外す（フォロー名は重複しうるため）
ALTER TABLE nenpyo DROP CONSTRAINT IF EXISTS nenpyo_user_id_name_key;

-- 3) 既存の follows を仮想年表行へ移行（follows が残っている場合のみ）
INSERT INTO nenpyo (user_id, name, color, sort_order, virtual_nenpyo_id)
SELECT f.follower_user_id, n.name, n.color,
       (SELECT COALESCE(MAX(x.sort_order), 0) FROM nenpyo x WHERE x.user_id = f.follower_user_id)
         + ROW_NUMBER() OVER (PARTITION BY f.follower_user_id ORDER BY f.created_at),
       n.id
FROM follows f
JOIN nenpyo n ON n.id = f.nenpyo_id;

-- 4) follows テーブルを削除
DROP TABLE IF EXISTS follows;

COMMIT;
