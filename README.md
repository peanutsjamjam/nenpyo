# nenpyo — 歴史年表アプリ

ユーザーごとにログインし、自分だけの歴史年表（出来事の一覧）を作成・表示するWebアプリ。

公開URL: **https://nenpyo.peanutsjamjam.jp/**（本番）／ **https://peanutsjamjam.jp/~sugawara/nenpyo/**（開発）

> 配信パス（サブパス/サブドメイン直下）に依存しない作りにしてある。配信パスは自動判定するので
> 環境ごとの差分はない（dev/prod で同じファイル・同じビルドでよい）:
> - `vite.config.ts` の `base` は相対 `'./'`（アセットは index.html からの相対参照）。
> - `.htaccess` は `RewriteBase` を持たない。
> - `api.cgi` の Cookie Path は `SCRIPT_NAME` から自動判定。

## 構成

```
ブラウザ (React SPA)
   │  fetch (Cookie セッション認証)
   ▼
api.cgi (Perl CGI, suexec で sugawara 実行)
   │  DBI / DBD::Pg (peer 認証・パスワード不要)
   ▼
PostgreSQL  DB: nenpyo  (users / sessions / signup_tokens / nenpyo / events / color_scheme / colors)
```

- **フロント**: Vite + React + TypeScript。`dist/` に本番ビルド。
  開始・終了の日付はそれぞれ1つのテキスト欄で入力し、保存時に `parseDateText` で年月日へ解析する
  （`1853`=年のみ／`1853/7/8`=年月日／`1853/7`=年月。区切りは `/` のみ。先頭 `-` は紀元前の符号）。
- **バックエンド**: `api.cgi`（`#!/usr/bin/perl`、DBI/DBD::Pg/JSON::PP/Digest::SHA）。
- **配信**: Apache UserDir（`~/public_html/nenpyo/` → `/~sugawara/nenpyo/`）。`.htaccess` で
  ルートと未知パスを `dist/` へ rewrite、実在ファイル（`api.cgi`）はそのまま実行。
- **認証**: パスワードは PBKDF2-HMAC-SHA256（12万回）でハッシュ化して `users` に保存。
  ログイン時にランダムトークンを `sessions` に保存し、`nenpyo_sid` Cookie（HttpOnly/Secure/SameSite=Lax）で受け渡し。
  - **ログインはメールアドレス＋パスワード**（`users.email` を `lower()` で一意）。
  - **サインアップはメール確認つきの2段階**: `signup_request{email}` で確認リンクを送信（`signup_tokens` に一時保存）→ リンク先で `signup_complete{token,username,password}` して登録。
- **ゲスト（一時ユーザー）**: 未ログインで訪れると自動で `is_guest=true`・`expires_at=now()+3日` のゲストを作成（`?action=guest`）、本会員とほぼ同機能で使える。期限切れゲストは login/guest 作成時の「ついで掃除」で `users` ごと削除。ゲスト中に本登録すると、そのゲストを本会員へ昇格させて作った年表を引き継ぐ。
- **配色スキーム**: `color_scheme`＋`colors`。設定「表示」タブのテーマ選択、開発用フラスコ2の配色一覧で編集する。
- **データ**: `events`。開始 `start_year`（必須・負値=紀元前）/`start_month`/`start_day`、
  終了 `end_year`/`end_month`/`end_day`（すべて任意。終了なし=単発の出来事）、`title`、`detail`、
  `nenpyo_id`（属する年表。最大1つ。未所属は NULL、年表削除時は NULL）。
  日は月とともに、月は年とともに指定する必要がある。ユーザーごとに分離。
- **年表**: `nenpyo`（ユーザーごと・`color` は `#rrggbb`・`sort_order`）。旧 `tags`。
  1つの出来事は最大1つの年表に属し（`events.nenpyo_id`）、期間バー／一覧ドットの色はその年表の色を使う。
  一覧は `sort_order` 順で、**ユーザーが上下ボタンで並び替え可能**（`tags_reorder`）。
  年表の作成・削除・並び替え・色付けは画面左の「年表」欄（ツリー）で行う。
- **フォロー**: 専用テーブルは持たず、`nenpyo.virtual_nenpyo_id` で表す。
  - `virtual_nenpyo_id` が NULL … 普通の（自分の）年表。
  - 値あり … 他人の年表を「フォロー」して取り込んだ**仮想年表**。値はフォロー先 `nenpyo.id`。
    フォロー時点の名前を自レコードの `name` にコピーし、`color`/`sort_order` は自分のものとして
    自由に変更・並び替えできる（＝自分の年表と順番を混ぜられる）。イベントはフォロー先のものを
    読み取り専用で取り込む（`events` が `nenpyo_id` を仮想年表 id に付け替えて `readonly:true` で返す）。
    フォロー先が削除されると id は宙に浮き、名前だけ残ってイベントは見えなくなる（外部キーは張らない）。

## API（`api.cgi`、`?action=` と HTTP メソッドで分岐）

| メソッド | action | 内容 |
|---|---|---|
| POST | signup_request | `{email}` 確認リンクをメール送信（既登録は 409 duplicate(email)） |
| GET | signup_verify&token=T | リンクの有効性確認 → `{email}` |
| POST | signup_complete | `{token,username,password}` 登録してログイン（ゲスト中なら本会員へ昇格） |
| POST | login | `{email,password}` ログイン（メールで認証） |
| POST | guest | ゲスト（一時ユーザー）を作成してログイン状態に（既セッションがあればそれを返す） |
| POST | logout | ログアウト |
| POST | change_password | `{current_password,new_password}` パスワード変更 |
| DELETE | account | アカウント削除（events/nenpyo/sessions を CASCADE 削除） |
| GET | me | `{username,email,guest}` / 未ログインは 401 |
| GET | env | `{env}` 実行環境名（env.pl 由来） |
| GET | color_schemes | 配色スキーム一覧＋色（要ログイン） |
| GET | events | 自分の出来事一覧（year, month, day 昇順） |
| POST | event | `{start_year,...,title,detail,nenpyo_id}` 追加 |
| PUT | event&id=ID | 更新（本人の項目のみ。`nenpyo_id` で所属年表を設定） |
| DELETE | event&id=ID | 削除（本人の項目のみ） |
| GET | tags | 自分の年表一覧（仮想年表含む。`virtual_nenpyo_id`/`virtual_dead`/`owner` 付き） |
| POST | tag | `{name,color}` 年表作成 |
| PUT | tag&id=ID | `{name,color}` 更新（本人のみ。仮想年表も色名変更可） |
| DELETE | tag&id=ID | 削除（本人のみ。仮想年表ならフォロー解除に相当） |
| POST | tags_reorder | `{ids:[..]}` 並び順を配列順に更新（sort_order を 1..n） |
| GET | explore&q=&offset=&limit= | 年表を検索。q は空白区切りの各語を 年表名/イベントのタイトル・詳細 に部分一致（語どうし OR）。`{strips,total}` を返す（ゲスト・自分の年表は除外、各年表に `followed` 付き） |
| POST | follow | `{nenpyo_id}` 年表をフォロー（name/color をコピーした仮想年表を作成） |
| DELETE | follow&nenpyo_id=ID | フォロー解除（その仮想年表行を削除） |
| GET/PUT/POST | dev_* | 開発用（全ユーザー一覧・配色編集など。`env=development` のみ、本番は 404） |

## 開発・公開フロー

編集は dev（`~/public_html/nenpyo` → `/~sugawara/nenpyo/`）で行う。ビルド前に nvm を有効化する。

```
cd ~/public_html/nenpyo
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
npm run dev      # ローカル確認 (http://localhost:5173) ※api.cgi/DB はローカルには無い
npm run build    # dist/ を更新（dev 配信 /~sugawara/nenpyo/ に反映）
```

本番（prod: `/var/jp.peanutsjamjam.nenpyo/html`、ServerName `nenpyo.peanutsjamjam.jp`、
Apache conf `/etc/httpd/conf.d/nenpyo.conf`）への反映は git pull + build:

```
git -C /var/jp.peanutsjamjam.nenpyo/html pull --ff-only
npm --prefix /var/jp.peanutsjamjam.nenpyo/html run build   # フロント（src/）を変更したときのみ
```

- `api.cgi` は `git pull` だけで反映（ビルド不要）。構文確認は `/usr/bin/perl -c api.cgi`。
- DB は dev/prod で**共有**（単一の `nenpyo`）。スキーマ変更は片方で流せば両方に効く。
- ブラウザ確認時はキャッシュに注意（Ctrl+F5 / Cmd+Shift+R）。

## サーバー前提（セットアップ済み）

- システムperl `/usr/bin/perl` に `perl-DBI` / `perl-DBD-Pg` / `perl-JSON-PP` / `perl-Digest-SHA` を導入済み
  （`sudo dnf install` で。`/usr/local/bin/perl` 5.36 には DBI が無いので注意）。
- DB `nenpyo` は作成済み。スキーマは `ddl/` にリレーションごとに置いてある。
  新規構築は依存順に流す:
  `for f in users sessions signup_tokens nenpyo events color_scheme colors; do psql -d nenpyo -f ddl/$f.sql; done`。
  既存DBの移行は `ddl/migrate_*.sql` を必要に応じて流す（各1回のみ）:
  `migrate_virtual_nenpyo.sql`（follows → nenpyo.virtual_nenpyo_id）、
  `migrate_users_email.sql`（users.email）、
  `migrate_users_guest.sql`（users.is_guest / expires_at）。
- CGI は suexec で `sugawara` として動くため、peer 認証でパスワード無し接続できる。

## 開発用シードデータ

複数ユーザーの動作確認用に、テストユーザー `user1` / `user2` / `user3`（各自の Primeタグ＋イベント）を作るスクリプトがある。

```
/usr/bin/perl ddl/seed_dev.pl    # 再実行すると同名ユーザーを作り直す
```

パスワードは3人とも `pass1234`（実際にログイン可）。本番データには流さないこと。
