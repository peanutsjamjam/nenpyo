-- nenpyo: ユーザーが作る「年表」。期間バーの色を持つ。
--   color は "#rrggbb" 形式（アプリ側で検証）。
--   sort_order は一覧での並び順（小さいほど先。ユーザーが上下で変更できる）。
--   （旧 tags テーブル。普通タグ／prime の区別は廃止し、全行が「年表」。）
--
--   virtual_nenpyo_id:
--     NULL    … 普通の（自分の）年表。
--     値あり  … 他人の年表を「フォロー」して取り込んだ仮想年表。値はフォロー先 nenpyo.id。
--               name はフォロー時点のフォロー先 name を自レコードにコピーして使う。
--               color / sort_order は自分のものとして自由に変更・並び替えできる。
--               フォロー先が削除されると id は宙に浮き、名前だけ残ってイベントは見えなくなる
--               （※あえて外部キーを張らない＝削除に追従させない）。
--   name は同一ユーザー内で一意である必要はない（フォロー名は重複しうる）。
--   普通年表どうしの一意性はアプリ側でチェックする。
CREATE TABLE nenpyo (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  color             TEXT NOT NULL DEFAULT '#9a6b3f',
  sort_order        INTEGER NOT NULL DEFAULT 0,
  virtual_nenpyo_id INTEGER,                         -- フォロー先 nenpyo.id（外部キーは張らない）
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 「自分がこの年表をフォローしているか」「フォロー先ごと」の検索用
CREATE INDEX nenpyo_virtual_idx ON nenpyo(virtual_nenpyo_id);
