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
1. index.html → 授業パスワード入力（entry_messageバナー表示あり）
2. student/entry.html → スート（♤♧♡♢）と数字（グループ番号）選択
3. student/expert.html → エキスパート活動（資料読解・要約・AIフィードバック）
4. student/sharing.html → 共有活動（掲示板形式：スートタブ・投稿・Realtime）
5. student/opinion.html → 意見シート記入（左カラムに共有活動パネル）
6. student/exchange.html → 意見交換

## Supabaseテーブル構成
- academic_years: 年度
- classes: クラス
- lessons: 授業（teacher_id, entry_message, sharing_mode カラムあり）
- lesson_materials: 資料（スートごと、keywords TEXT[]カラムあり）
- lesson_sessions: 授業セッション（sharing_public BOOLEANカラムあり）
- student_sessions: 生徒の活動記録（suit, card_number, summary_text, summary_submitted_at等）
- ai_interactions: AI対話履歴
- exchange_posts: 意見交換投稿
- exchange_likes: いいね
- sharing_posts: 共有活動投稿（card_number, suit, post_type, content, target_suit）
  - post_typeは 'question' / 'note' / 'expert_reply' の3種

## RLSポリシー構成（重要）
- lessons: anonはSELECT全件可（anon_read_lessons）。authenticatedは自分のteacher_idのみCRUD可
- lesson_materials: anonはSELECT全件可。authenticatedは自分のlessonsに紐づくもののみCRUD可
- lesson_sessions: anonはSELECT全件可。authenticatedは自分のlessonsに紐づくもののみCRUD可
- sharing_posts: anonもauthenticatedも全件CRUD可
- **注意**: RLSマイグレーション後にanon_read系ポリシーが消えると生徒のパスワード入力が壊れる

## 既知の注意点
- GitHub PagesのサブパスはURLに含まれる（https://tk2125.github.io/jigsaw-app-2026/）
  - redirectToにwindow.location.originを使うとサブパスが欠落する → window.location.hrefを使う
- teacher/index.htmlには#error-message と #success-message の両方が必要

## テストデータ
- 授業パスワード: jigsaw2026
- 授業名: 【テスト】産業革命と近代社会
- スート: ♤工場労働 / ♧都市化 / ♡中産階級

## 主要ファイル
- js/config.js: Supabase接続情報（SUPABASE_URL, SUPABASE_ANON_KEY, EDGE_FUNCTION_BASE_URL）
- js/supabase-client.js: DB操作関数まとめ（getSharingPosts/createSharingPost/setSharingPublic含む）
- js/claude-client.js: Edge Function呼び出し（_callメソッドにAuthorizationヘッダー必須）
- js/student/entry.js: ログイン・進捗判定・ページ振り分け
- js/student/expert.js: エキスパート活動ロジック（コピペチェック含む）
- js/student/sharing.js: 共有活動（掲示板形式・Realtime購読・30秒ポーリング）
- js/student/opinion.js: 意見シート（setupSharingPanel()で共有活動パネルを遅延描画）
- js/teacher/dashboard.js: ダッシュボード（sharing_public/exchange_phaseトグル・生徒詳細モーダル）
- js/teacher/lesson-admin.js: 授業管理（keywords/sharing_mode対応済み）
- js/teacher/auth.js: 教師認証（handlePasswordReset: redirectTo=window.location.href）
- css/sharing.css: 共有活動+opinionパネル共通スタイル（student/sharing.html・opinion.htmlで使用）
- supabase/schema.sql: 全テーブル定義＋マイグレーション（末尾に2ブロック追記済み）
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
- [x] コピペ対策（AIによるcopy_checkチェック）
- [x] Edge FunctionへのAuthorizationヘッダー修正（401エラー解消）
- [x] 教師画面の整備（2026-03-19）
  - RLS: teacher_idによる授業の教師別アクセス制限
  - entry_message: パスワード照合後のカスタムバナー表示
  - 生徒提出物の詳細閲覧モーダル（ダッシュボード行クリック）
  - パスワードリセットリンク（teacher/index.html）
- [x] sharing.html 全面改修（掲示板形式）（2026-03-19）
  - スートタブで各チームの要約＋投稿を切り替え表示
  - 投稿タイプ：質問 / メモ追記 / エキスパート回答（自分のスートタブのみ）
  - Supabase Realtimeリアルタイム購読 ＋ 30秒ポーリング（フォールバック）
  - sharing_publicモード：教師がONにすると全グループの投稿が見える
  - 要約テキストはコピー禁止（user-select: none）
- [x] opinion.html 改修（2026-03-19）
  - 左カラムをsessionStorage共有メモ→共有活動パネル（折りたたみ）に変更
  - スートフィルター付き、パネル開放時に遅延読み込み
- [x] teacher/lesson-admin.html 改修（2026-03-19）
  - ⑥共有活動設定セクション追加（表示形式・スートごとキーワード）
- [x] teacher/dashboard.html 改修（2026-03-19）
  - sharing_publicトグル追加

## Supabaseマイグレーション状況
supabase/schema.sql 末尾に2ブロック追記済み。**本番DBへの適用はユーザーが手動実行**。
- マイグレーション1: sharing_postsテーブル作成 + sharing_public/sharing_mode/keywordsカラム追加
- マイグレーション2: teacher_id/entry_messageカラム追加 + RLSポリシー再構成
- ※ マイグレーション後にanon_read_lessonsポリシーが消えた場合は手動で再作成が必要

## 未着手・今後の作業候補
- [ ] 本番用マイグレーションの動作確認（sharing_posts/sharing_publicが実際に機能するか）
- [ ] 全フロー通し確認（index→entry→expert→sharing→opinion→exchange）
- [ ] 本番用データ（実際の授業）の作成
- [ ] student_sessionsのテストデータリセット機能（教師画面から）

## 2026-03-18 作業ログ②
### 完了した作業
- sharing.htmlを掲示板形式に全面改修
  - スートタブ切り替え・質問/メモ/エキスパート回答の投稿
  - Supabaseリアルタイム購読＋30秒ポーリングフォールバック
  - sharing_publicフラグによる全体公開モード対応
  - キーワードモードの土台（sharing_mode='keyword'の分岐コメント）を組み込み済み
- opinion.htmlの左カラムを折りたたみパネルに改修（sharing_posts参照）
- teacher/lesson-admin.htmlに共有活動設定セクション追加
- teacher/dashboard.htmlにsharing_publicトグル追加
- 全変更をgit push済み

### 未実施：Supabaseマイグレーション（★次回最初にやること）
schema.sqlの末尾に2つのマイグレーションブロックが追記されている。
Supabase SQL Editor（https://supabase.com/dashboard/project/vahtoxoyigemtldcmlnn/sql/new）で
以下のコマンドで確認してから実行すること：
  grep -n "マイグレーション" supabase/schema.sql
  sed -n 'XXX,$p' supabase/schema.sql  ← XXXは上のコマンドで確認した行番号

### 今後の作業候補
- [ ] Supabaseマイグレーション実行後、sharing.htmlの動作確認
- [ ] opinion.htmlの折りたたみパネル動作確認
- [ ] teacher/dashboard.htmlのsharing_publicトグル動作確認
- [ ] teacher/lesson-admin.htmlのキーワード入力欄動作確認
- [ ] 本番用授業データの作成
- [ ] スマートフォン表示の確認

### 設計メモ：共有活動の掲示板形式
- sharing_postsテーブル新設（lesson_session_id, card_number, suit, post_type, content, target_suit）
- post_typeは question / note / expert_reply の3種
- sharing_public=FALSEで同グループのみ、TRUEで全グループに公開
- キーワードモードへの切り替えはlessons.sharing_modeフラグで制御（'full'/'keyword'）
- キーワードはlesson_materials.keywordsに配列で保存
