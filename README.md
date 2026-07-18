# Flowmap

全体像を失わずに、イベントや短中期業務のTODOを整理するローカルWebアプリです。

- フェーズ / 作業グループ / TODO / チェック項目
- 任意の期限・担当・依存関係
- 一覧、全体図、期限順、PDFプレビュー
- IndexedDBへの自動保存
- JSON / YAMLの入出力
- ブラウザの印刷機能によるPDF化
- AI・外部API・ログイン不要

## 公開

ビルド工程を必要としない静的サイトのため、GitHub Actionsではなく、`main`ブランチのルートから直接GitHub Pagesへ公開します。

初回のみ、リポジトリで次を設定してください。

1. **Settings → Pages** を開く
2. **Build and deployment → Source** を **Deploy from a branch** にする
3. Branchを **main**、Folderを **/ (root)** にする
4. **Save** を押す

公開後は次のURLで利用できます。

`https://silovar-uk.github.io/flowmap/`

反映には数分かかることがあります。リポジトリには `.nojekyll` を置き、ファイルを加工せずそのまま配信します。

## ローカルで開く

簡易HTTPサーバーを起動します。

```bash
python -m http.server 8000
```

その後、`http://localhost:8000` を開きます。

## データについて

データはブラウザ内のIndexedDBに保存されます。別端末への同期は行いません。定期的にJSONまたはYAMLを書き出してください。

## 設計原則

- 左側で全体を失わない
- 右側で具体を処理する
- すべてをフロー化しない
- 細部はチェック項目へ吸収する
- 独立したTODOを無理につながない
- 装飾より一覧性と情報到達速度を優先する
