# きみちゃんキッチン (Kimichan Kitchen) 開発仕様書

## 1. プロジェクト概要
- **名称**: きみちゃんキッチン
- **目的**: 家庭内の食材・調味料の在庫管理システム。
- **ターゲット**: スマホブラウザでの利用を想定したUI/UX。

## 2. 技術スタック & アーキテクチャ
- **Backend**: Go (Golang) 1.24+
  - Web Server: 標準の `net/http`
  - Database: SQLite3 (`github.com/mattn/go-sqlite3`)
- **Frontend**: Vanilla JavaScript + HTML + CSS
  - Framework: なし（SPA構成を採用）
  - Style: `static/css/style.css` で一元管理
  - View: `static/views/*.html` を `fetch` で動的に読み込み
- **インフラ**: ローカルサーバー (`localhost:8080`)

## 3. ディレクトリ構成
```text
kimichan/
├── main.go               # エントリーポイント & ルーティング
├── database.go           # DB初期化・テーブル作成定義
├── dataloader.go         # 初期シードデータ投入
├── handlers_*.go         # 各機能のAPIハンドラ (catalog, ingredients, seasonings, import)
├── models.go             # 構造体定義
├── kimichan.db           # SQLiteデータベースファイル
├── SPEC.md               # 本仕様書
└── static/               # フロントエンド静的ファイル
     ├── index.html       # アプリの土台（ヘッダー・フッター・コンテナ）
     ├── css/
     │    └── style.css   # 全スタイルの定義
     ├── js/
     │    ├── app.js      # SPAルーティング・画面切り替えロジック
     │    ├── catalog.js  # 図鑑画面のロジック
     │    ├── inventory.js # 食材在庫画面のロジック
     │    └── seasoning.js # 調味料画面のロジック
     └── views/
          ├── catalog_view.html   # 図鑑画面のHTML部品
          ├── inventory_view.html # 食材在庫画面のHTML部品
          └── seasoning_view.html # 調味料画面のHTML部品