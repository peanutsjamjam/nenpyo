-- 既存の users テーブルに email 列を追加する移行用スクリプト（冪等）。
--   新規登録では email 必須・大文字小文字を無視して一意。既存行は NULL のまま。
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uniq ON users (lower(email)) WHERE email IS NOT NULL;
