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
※ アクセストークンは毎回ユーザーに確認する

## アプリの画面フロー
1. index.html → 授業パスワード入力
2. student/entry.html → スート（♤♧♡♢）と数字（グループ番号）選択
3. student/expert.html → エキスパート活動（資料読解・要約・AIフィードバック）
4. student/sharing.html → 共有活動（同グループの要約を表示・メモ）★最近追加
5. student/opinion.html → 意見シート記入
6. student/exchange.html → 意見交換

## Supabaseテーブル構成
- academic_years: 年度
- classes: クラス
- lessons: 授業
- lesson_materials: 資料（スートごと）
- lesson_sessions: 授業セッション（パスワード含む）
- student_sessions: 生徒の活動記録（suit, card_number, summary_text, summary_submitted_at など）

## 現在の既知のバグ・未解決事項
- [x] ♤Aで入室するとエキスパートを飛ばして共有ページに直接遷移する
      （対処済み：student_sessionsのsummary_submitted_atをNULLリセット）
- [x] 他スート・番号でopinion.htmlに直接遷移してしまう
      （対処済み：entry.jsの遷移先をstudent/sharing.htmlに修正・再デプロイ）

## 完了済み作業
- [x] 全27ファイル生成
- [x] Supabase テーブル6個作成
- [x] Edge Function（claude-proxy）デプロイ済み
- [x] GitHubプッシュ・GitHub Pages有効化
- [x] テストデータ投入（授業パスワード: jigsaw2026）
- [x] 共有活動ページ（sharing.html）追加

## ファイル構成メモ
- js/config.js: Supabase接続情報
- js/supabase-client.js: DB操作関数まとめ
- js/student/entry.js: ログイン・進捗判定・ページ振り分け
- supabase/functions/claude-proxy/index.ts: Edge Function本体
