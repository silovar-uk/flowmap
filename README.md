# Flowmap

テキストで工程を書き、キャンバスで前後関係を確かめる、アウトライン型の業務ホワイトボードです。

## v0.17.0 — 文章で作り、図で確かめる

入力の中心をキャンバスから左側のアウトラインへ移しました。

```text
工程を書く
  ↓
上下順から通常の矢印を自動生成
  ↓
分岐・合流・参照だけGUIで補う
  ↓
キャンバスで流れを確認する
```

既存の図形、囲み、補足情報、ボード保存はそのまま利用できます。

## アウトライン入力

左側の「工程」で、工程名を直接編集します。

- `Enter`：次の工程を追加
- `Tab`：1段階インデント
- `Shift＋Tab`：インデントを戻す
- `Ctrl / Cmd＋Enter`：関係追加メニューを開く
- 空行で`Backspace`：工程を削除
- 行の左端をドラッグ：工程を並べ替える
- 上下キー：前後の工程へ移動

アウトラインの上下順が、基本的な実行順です。

```text
受付
確認
承認
公開
```

上の入力から、通常の矢印をすべて表示します。

```text
受付 → 確認 → 承認 → 公開
```

## 自動接続と手動接続

矢印には生成元を保存します。

```text
auto    アウトライン順から自動生成
manual  GUIで作成・変更した関係
```

アウトラインを並べ替えると、`auto`の矢印だけを再計算します。`manual`の矢印は維持します。

自動矢印の端を別工程へつなぎ直した場合は、元の自動接続を抑制し、変更後を手動接続として保存します。右側の補足欄から接続元・接続先を変更した場合も同じです。

## 関係の種類

アウトライン各行の右端に、前工程との関係を示すチップがあります。

- **通常**：基本的な順送り
- **分岐**：ひとつの工程から複数へ進む
- **合流**：複数の工程がひとつへ集まる
- **参照**：実行順ではない関連

チップを押すと種類を順番に切り替えます。より細かく指定するときは、工程を選び「関係を追加」または`Ctrl / Cmd＋Enter`を使います。

矢印を選ぶと右側で、関係の種類、生成元、接続元、接続先、ラベルを編集できます。現在のアウトライン順に該当する手動接続は「アウトライン順へ戻す」で自動接続へ戻せます。

## 図へ整列

左下の**図へ整列**を押すと、アウトライン順とインデントを基にカードを並べ直します。

- 上下方向に工程順を反映
- インデントを横方向の差として反映
- 囲みに属する工程は囲みの内側へ配置
- 必要な場合は囲みを拡張

手動で置いた位置を保ちたい場合は押す必要はありません。

## 矢印デザイン

矢印の末端と経路を刷新しました。

- 先端を大きな塗り三角形へ変更
- 選択中はさらに大きい青い先端を表示
- カード外周へ正確に接続
- 接続直前へ白いハローを表示
- 線の下へ白い下地を敷き、カードや別の線から分離
- 直角経路の角を小さく丸める
- 通常、分岐・合流、参照で線種と強さを変更
- 参照関係は破線と開いた矢印で表示
- 自動接続はやや薄く、手動接続は少し濃く表示

矢印へポインターを重ねると、接続元と接続先をツールチップで確認できます。

## キャンバス操作

- 空白クリック：何もしない
- 空白ドラッグ：ボード移動
- `Shift＋空白ドラッグ`：範囲内だけに選び直す
- `Ctrl / Cmd＋Shift＋空白ドラッグ`：現在の選択へ追加
- `Shift＋図形クリック`：複数選択へ追加・解除
- `Ctrl / Cmd＋空白クリック`：その位置へ処理を追加
- `Ctrl / Cmd＋Alt / Option＋クリック`：方眼に吸着せず追加
- `Space＋ドラッグ`または中ボタンドラッグ：ボード移動

キャンバスから処理を追加した場合も、アウトライン末尾へ組み込まれます。

## 囲みと完了表示

- 複数の図形を選び、囲みにまとめられる
- 囲みを折りたたむと内部工程を非表示にできる
- 外部へつながる矢印は折りたたみ囲みの外周へ接続する
- 完了した工程は無彩色で表示する
- 全工程が完了した囲みも灰色で表示する

## 保存

編集内容はIndexedDBへ自動保存します。

- 複数ボード管理
- JSON / YAMLの書き出しと読み込み
- PDF出力
- Undo / Redo

既存ボードを開いた際は、現在のカード位置を基にアウトライン順を補完します。既存の矢印は手動接続として保持され、足りない通常接続だけを自動生成します。

## ファイル構成

```text
index.html
styles/
  base.css
  board.css
  panels.css
  flowchart.css
  workspace-management.css
  ui-redesign.css
  information-density.css
  flow-experience.css
  multi-selection.css
  group-workflow.css
  canvas-add-mode.css
  canvas-navigation-mode.css
  outline-workflow.css
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
  flowchart.js
  workspace-management.js
  ui-redesign.js
  keyboard-shortcuts.js
  information-density.js
  flow-experience.js
  multi-selection.js
  group-workflow.js
  canvas-add-mode.js
  canvas-navigation-mode.js
  outline-model.js
  edge-clarity.js
  outline-editor.js
  outline-polish.js
  ui-bootstrap.js
```

ビルド工程はありません。HTML、CSS、JavaScriptを直接読み込みます。

## 公開

`https://silovar-uk.github.io/flowmap/`

## ローカルで開く

```bash
python -m http.server 8000
```

`http://localhost:8000`を開きます。
