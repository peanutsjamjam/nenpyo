# nenpyo — 歴史年表アプリ

ユーザーごとにログインし、自分だけの歴史年表（出来事の一覧）を作成・表示するWebアプリ。

公開URL: **https://peanutsjamjam.jp/~sugawara/nenpyo/**

> ディレクトリ名・DB名ともに `nenpyo`（旧称 `testapp1` から改名済み）。配信サブパスを変えるときは
> `vite.config.ts` の `base`、`.htaccess` の `RewriteBase`、`api.cgi` の `$COOKIE_PATH` を合わせて変更する。

## 構成

```
ブラウザ (React SPA)
   │  fetch (Cookie セッション認証)
   ▼
api.cgi (Perl CGI, suexec で sugawara 実行)
   │  DBI / DBD::Pg (peer 認証・パスワード不要)
   ▼
PostgreSQL  DB: nenpyo  (users / sessions / nenpyo / events / follows)
```

- **フロント**: Vite + React + TypeScript。`dist/` に本番ビルド。
  開始・終了の日付はそれぞれ1つのテキスト欄で入力し、保存時に `parseDateText` で年月日へ解析する
  （`1853`=年のみ／`1853/7/8`=年月日／`1853/7`=年月。区切りは `/` のみ。先頭 `-` は紀元前の符号）。
- **バックエンド**: `api.cgi`（`#!/usr/bin/perl`、DBI/DBD::Pg/JSON::PP/Digest::SHA）。
- **配信**: Apache UserDir（`~/public_html/nenpyo/` → `/~sugawara/nenpyo/`）。`.htaccess` で
  ルートと未知パスを `dist/` へ rewrite、実在ファイル（`api.cgi`）はそのまま実行。
- **認証**: パスワードは PBKDF2-HMAC-SHA256（12万回）でハッシュ化して `users` に保存。
  ログイン時にランダムトークンを `sessions` に保存し、`nenpyo_sid` Cookie（HttpOnly/Secure/SameSite=Lax）で受け渡し。
- **データ**: `events`。開始 `start_year`（必須・負値=紀元前）/`start_month`/`start_day`、
  終了 `end_year`/`end_month`/`end_day`（すべて任意。終了なし=単発の出来事）、`title`、`detail`、
  `nenpyo_id`（属する年表。最大1つ。未所属は NULL、年表削除時は NULL）。
  日は月とともに、月は年とともに指定する必要がある。ユーザーごとに分離。
- **年表**: `nenpyo`（ユーザーごと・`name` 一意・`color` は `#rrggbb`・`sort_order`）。旧 `tags`。
  1つの出来事は最大1つの年表に属し（`events.nenpyo_id`）、期間バー／一覧ドットの色はその年表の色を使う。
  一覧は `sort_order` 順で、**ユーザーが上下ボタンで並び替え可能**（`tags_reorder`）。
  年表の作成・削除・並び替え・色付けは画面左の「年表」欄（ツリー）で行う。
- **フォロー**: `follows`（`follower_user_id`, `nenpyo_id`）。他ユーザーの年表をフォローする関係。

## API（`api.cgi`、`?action=` と HTTP メソッドで分岐）

| メソッド | action | 内容 |
|---|---|---|
| POST | register | `{username,password}` 登録してログイン |
| POST | login | `{username,password}` ログイン |
| POST | logout | ログアウト |
| GET | me | `{username}` / 未ログインは 401 |
| GET | events | 自分の出来事一覧（year, month, day 昇順） |
| POST | event | `{start_year,...,title,detail,nenpyo_id}` 追加 |
| PUT | event&id=ID | 更新（本人の項目のみ。`nenpyo_id` で所属年表を設定） |
| DELETE | event&id=ID | 削除（本人の項目のみ） |
| GET | tags | 自分の年表一覧（sort_order 昇順） |
| POST | tag | `{name,color}` 年表作成 |
| PUT | tag&id=ID | `{name,color}` 更新（本人のみ） |
| DELETE | tag&id=ID | 削除（本人のみ。所属イベントの nenpyo_id は NULL に） |
| POST | tags_reorder | `{ids:[..]}` 並び順を配列順に更新（sort_order を 1..n） |
| GET | explore | 全ユーザーの年表＋イベント（各年表に `followed` 付き） |
| GET | follows | フォロー中の年表一覧（所有者名つき） |
| GET | followed | フォロー中の年表＋そのイベント（本画面に読み取り混在用） |
| POST | follow | `{nenpyo_id}` 年表をフォロー（自分の年表は不可） |
| DELETE | follow&nenpyo_id=ID | フォロー解除 |

## 開発・公開フロー

```
cd ~/public_html/nenpyo
npm run dev      # ローカル確認 (http://localhost:5173) ※api.cgi/DBはローカルには無い
npm run build    # dist/ を更新 = 公開サイトに即反映
```

ブラウザ確認時はキャッシュに注意（Ctrl+F5 / Cmd+Shift+R）。

## サーバー前提（セットアップ済み）

- システムperl `/usr/bin/perl` に `perl-DBI` / `perl-DBD-Pg` / `perl-JSON-PP` / `perl-Digest-SHA` を導入済み
  （`sudo dnf install` で。`/usr/local/bin/perl` 5.36 には DBI が無いので注意）。
- DB `nenpyo` は作成済み。スキーマは `ddl/` にリレーションごとに置いてある。
  新規構築は依存順に流す: `for f in users sessions nenpyo events follows; do psql -d nenpyo -f ddl/$f.sql; done`。
- CGI は suexec で `sugawara` として動くため、peer 認証でパスワード無し接続できる。

## 開発用シードデータ

複数ユーザーの動作確認用に、テストユーザー `user1` / `user2` / `user3`（各自の Primeタグ＋イベント）を作るスクリプトがある。

```
/usr/bin/perl ddl/seed_dev.pl    # 再実行すると同名ユーザーを作り直す
```

パスワードは3人とも `pass1234`（実際にログイン可）。本番データには流さないこと。
