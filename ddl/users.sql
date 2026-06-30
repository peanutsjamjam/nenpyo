-- users: アカウント。パスワードは PBKDF2-HMAC-SHA256 のハッシュで保存する。
--   email は新規登録で必須。大文字小文字を無視して一意（移行前の古い行は NULL を許容）。
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT,                    -- 登録時に必須。NULL は移行前アカウント
  password_hash TEXT NOT NULL,           -- PBKDF2-HMAC-SHA256 (hex)
  salt          TEXT NOT NULL,           -- hex
  iterations    INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- メールアドレスは大文字小文字を無視して一意（NULL は重複可＝移行前アカウント）。
CREATE UNIQUE INDEX users_email_lower_uniq ON users (lower(email)) WHERE email IS NOT NULL;
