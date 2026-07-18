# Flowmap

付箋と囲みを直接操作しながら、業務の流れ、前後関係、補足情報を整理するローカルWebアプリです。

## v0.7.1

「機能を選んで操作する」のではなく、考えながらそのまま付箋を増やせる操作体系へ更新しました。

### 追加と編集

- ボードの空白をダブルクリック：その場に付箋を追加し、すぐ入力
- 付箋をダブルクリック／選択してEnter：その場でタイトル編集
- 編集中にEnter／Tab：下に次の付箋を追加
- 編集中にShift+Enter：右に子付箋を追加し、自動で接続
- 付箋上の小さな操作から、期限、担当、状態、タグ、メモを更新
- 詳細情報は右側の補足パネルで編集

### ドラッグ操作

- 付箋をドラッグ：自由に移動
- 付箋を囲みへドロップ：所属する囲みとフェーズを変更
- 付箋を矢印の途中へドロップ：前後の矢印へ自動挿入
- 付箋同士を重ねる：2枚を新しい囲みへまとめる候補を表示
- 付箋右端の点を既存の付箋へドラッグ：接続
- 付箋右端の点を空白へドラッグ：接続された新しい付箋を作成
- Shiftを押しながら空白へ接続：3枚の分岐付箋を作成
- 選択した矢印の端点をドラッグ：接続元・接続先を付け替え
- 囲みの見出しをドラッグ：囲みと内部の付箋をまとめて移動

### キーボード

- `Enter`：選択した付箋を編集
- `Tab`：下に付箋を追加
- `Shift + Enter`：子付箋を追加して接続
- `Ctrl / Cmd + D`：複製
- `Delete`：削除
- `Space + ドラッグ`：ボードを移動
- `F`：選択項目または全体へズーム
- `Ctrl / Cmd + K`：検索
- `Ctrl / Cmd + Z`：元に戻す

### 表示と記録

- ズーム倍率に応じて、付箋の情報量を自動変更
- 遠景では形、近景ではタイトル・状態・期限・担当・タグを表示
- 選択中の付箋は遠景でも内容と操作を展開
- 更新時刻を付箋へ表示
- 付箋ごとの変更履歴を記録
- JSON / YAML入出力、PDF出力、検索、ミニマップ、自動整列
- AI、ログイン、外部APIは不要

## ファイル構成

圧縮した単一ファイルを廃止し、役割ごとに分割しています。

```text
index.html
styles/
  base.css
  board.css
  panels.css
src/
  core.js
  migration.js
  render-board.js
  render-inspector.js
  actions-notes.js
  actions-layout.js
  interactions-drag.js
  interactions-connect.js
  events-ui.js
  events-fields.js
  events-main.js
```

ビルド工程はありません。HTML、CSS、JavaScriptを直接編集して確認できます。

## 公開

GitHub Pagesを`main`ブランチのルートから直接公開します。

1. **Settings → Pages**
2. **Build and deployment → Source**を**Deploy from a branch**
3. Branchを**main**、Folderを**/ (root)**
4. **Save**

公開URL：

`https://silovar-uk.github.io/flowmap/`

## ローカルで開く

```bash
python -m http.server 8000
```

`http://localhost:8000`を開きます。

## データ

データはブラウザのlocalStorageに`flowmap:v7`として保存されます。`flowmap:v4`〜`v6`など、旧版の互換データが見つかった場合は、付箋・囲み・フェーズ・矢印・補足情報を可能な範囲でv0.7形式へ自動移行します。元の保存領域は削除しません。別端末との同期は行わないため、必要に応じてJSONまたはYAMLを書き出してください。
