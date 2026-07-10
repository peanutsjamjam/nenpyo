-- users にゲスト（一時ユーザー）用の列を追加する移行。
--   is_guest   … ログインせずに使い始めた一時ユーザーなら true。
--   expires_at … ゲストの失効時刻。この時刻を過ぎたゲストは「ついで掃除」で users ごと削除
--                （events / nenpyo / sessions は ON DELETE CASCADE で道連れ）。
--   通常アカウントは is_guest=false・expires_at=NULL。本登録でゲストを昇格させるときに解除する。
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_guest   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 期限切れゲストの掃除を速くする部分インデックス。
CREATE INDEX IF NOT EXISTS users_guest_expires_idx ON users (expires_at) WHERE is_guest;
