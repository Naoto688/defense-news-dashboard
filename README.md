# 防衛関連ニュース統合ダッシュボード

防衛・安全保障に関するニュースを一元的に収集・整理し、重要記事の保存や分析メモの記録を行うWebダッシュボードです。

## 公開URL

[https://naoto688.github.io/defense-news-dashboard/](https://naoto688.github.io/defense-news-dashboard/)

## 主な機能

- 外部RSSフィードから防衛・安全保障ニュースを自動取得し、記事内のキーワードをもとに陸上防衛、海上防衛、航空防衛、宇宙・サイバー、国際情勢・技術に自動分類
- KPIサマリー（総記事数・本日新着・重要クリップ数）の表示
- カテゴリーによる絞り込み、キーワード検索、クリップ済み記事のみの表示
- Supabaseに重要記事を永続保存し、各記事に「分析・考察メモ」を記録。PCとiPhone間でデータを同期
- Supabase Authによるログイン認証と、Row Level Security（RLS）によるアクセス保護
- PWA対応により、iPhoneのホーム画面に追加してスタンドアロンの全画面で起動

## 使用技術

- HTML：Webページの構造
- CSS：ダークモードとレスポンシブデザイン
- JavaScript：画面の動作、RSSデータの取得・分類
- RSSフィード：rss2json APIを優先し、取得失敗時はAllOrigins経由で外部RSSを取得
- Supabase：PostgreSQLデータベース、Auth、RLS
- GitHub Pages：Webホスティングと自動デプロイ
- PWA：`manifest.json`とPNGアイコン
