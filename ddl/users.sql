-- users: アカウント。パスワードは PBKDF2-HMAC-SHA256 のハッシュで保存する。
--   email は新規登録で必須。大文字小文字を無視して一意（移行前の古い行は NULL を許容）。
--   is_guest/expires_at はログインせずに使い始めた一時ユーザー（ゲスト）用。
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT,                    -- 登録時に必須。NULL は移行前アカウント/ゲスト
  password_hash TEXT NOT NULL,           -- PBKDF2-HMAC-SHA256 (hex)
  salt          TEXT NOT NULL,           -- hex
  iterations    INTEGER NOT NULL,
  is_guest      BOOLEAN NOT NULL DEFAULT false, -- 一時ユーザー（ゲスト）なら true
  expires_at    TIMESTAMPTZ,             -- ゲストの失効時刻。過ぎたら users ごと掃除
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- メールアドレスは大文字小文字を無視して一意（NULL は重複可＝移行前アカウント/ゲスト）。
CREATE UNIQUE INDEX users_email_lower_uniq ON users (lower(email)) WHERE email IS NOT NULL;

-- 期限切れゲストの掃除を速くする部分インデックス。
CREATE INDEX users_guest_expires_idx ON users (expires_at) WHERE is_guest;
