# ジグソー授業支援アプリ CLAUDE.md

## プロジェクト概要
高校の「ジグソー法」授業を支援するWebアプリ。
GitHub Pages（静的HTML）+ Supabase（DB・認証）+ Supabase Edge Function（AI）構成。

## 重要な接続情報
- GitHub: https://github.com/tk2125/jigsaw-app-2026
- GitHub Pages: https://tk2125.github.io/jigsaw-app-2026/
- Supabase Project Ref: vahtoxoyigemtldcmlnn
- Supabase Dashboard: https://supabase.com/dashboard/project/vahtoxoyigemtldcmlnn

## デプロイ方法
### フロントエンド（GitHub Pages）
git add . && git commit -m "変更内容" && git push

### Edge Function
SUPABASE_ACCESS_TOKEN=sbp_... supabase functions deploy claude-proxy --project-ref vahtoxoyigemtldcmlnn
※ アクセストークンは毎回ユーザーに確認する（使い捨て運用）

## アプリの画面フロー
1. index.html → 授業パスワード入力
2. student/entry.html → スート（♤♧♡♢）と数字（グループ番号）選択
3. student/expert.html → エキスパート活動（資料読解・要約・AIフィードバック）
4. student/sharing.html → 共有活動（同グループの要約を表示・メモ）
5. student/opinion.html → 意見シート記入（左カラムに共有メモ表示）
6. student/exchange.html → 意見交換

## Supabaseテーブル構成
- academic_years: 年度
- classes: クラス
- lessons: 授業
- lesson_materials: 資料（スートごと）
- lesson_sessions: 授業セッション（パスワード含む）
- student_sessions: 生徒の活動記録（suit, card_number, summary_text, summary_submitted_at等）
- ai_interactions: AI対話履歴
- exchange_posts: 意見交換投稿
- exchange_likes: いいね

## テストデータ
- 授業パスワード: jigsaw2026
- 授業名: 【テスト】産業革命と近代社会
- スート: ♤工場労働 / ♧都市化 / ♡中産階級

## 主要ファイル
- js/config.js: Supabase接続情報（SUPABASE_URL, SUPABASE_ANON_KEY, EDGE_FUNCTION_BASE_URL）
- js/supabase-client.js: DB操作関数まとめ
- js/claude-client.js: Edge Function呼び出し（_callメソッドにAuthorizationヘッダー必須）
- js/student/entry.js: ログイン・進捗判定・ページ振り分け
- js/student/expert.js: エキスパート活動ロジック（コピペチェック含む）
- js/student/sharing.js: 共有活動ロジック（30秒自動更新・コピー機能）
- js/student/opinion.js: 意見シート（左カラムに共有メモ表示）
- supabase/functions/claude-proxy/index.ts: Edge Function本体

## Edge Functionのリクエストタイプ
- summary_feedback: 要約へのAIフィードバック
- explanation_practice: AI説明練習
- copy_check: コピペ判定（資料と要約を比較してJSON返却）
- opinion_feedback: 意見へのAIフィードバック

## 完了済み作業
- [x] 全ファイル生成・GitHub Pages公開
- [x] Supabaseテーブル・認証設定
- [x] Edge Function（claude-proxy）デプロイ
- [x] テストデータ投入
- [x] 共有活動ページ（sharing.html）追加
  - 同グループ番号の全スート要約を左カラムに表示
  - 30秒自動更新
  - Markdown/テキスト形式でコピー可能
- [x] opinion.htmlに共有メモ表示（左カラム参照）
- [x] コピペ対策（AIによるcopy_checkチェック）
  - 資料と酷似した要約は送信ブロック＋警告表示
- [x] Edge FunctionへのAuthorizationヘッダー修正（401エラー解消）

## 未着手・今後の作業候補
- [ ] 動作確認：各画面の全フロー通し確認
- [ ] 教師画面の動作確認
- [ ] 本番用データ（実際の授業）の作成
- [ ] student_sessionsのテストデータリセット機能（教師画面から）
