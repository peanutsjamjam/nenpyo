-- users: アカウント。パスワードは PBKDF2-HMAC-SHA256 のハッシュで保存する。
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,           -- PBKDF2-HMAC-SHA256 (hex)
  salt          TEXT NOT NULL,           -- hex
  iterations    INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
