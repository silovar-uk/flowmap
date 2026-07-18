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

`main` への更新を契機に、GitHub ActionsからGitHub Pagesへデプロイします。

初回のみ、リポジトリの **Settings → Pages → Build and deployment → Source** で **GitHub Actions** を選択してください。公開後は次のURLで利用できます。

`https://silovar-uk.github.io/flowmap/`

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
