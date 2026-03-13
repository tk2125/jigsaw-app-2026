# Supabase セットアップ手順

## 1. Supabaseプロジェクト作成

1. https://supabase.com でアカウント作成・ログイン
2. "New project" をクリック
3. プロジェクト名・データベースパスワードを設定（パスワードは保管しておく）
4. リージョン: Northeast Asia (Tokyo) 推奨

## 2. データベース作成

1. Supabaseダッシュボード → 左メニュー "SQL Editor"
2. `schema.sql` の内容を全てコピーして貼り付け
3. "Run" で実行（エラーがないか確認）

## 3. 教師アカウント作成

1. ダッシュボード → "Authentication" → "Users"
2. "Add user" → "Create new user"
3. メールアドレスとパスワードを設定
4. このメールアドレス＋パスワードを教師ログイン画面で使用

## 4. Edge Function デプロイ

Supabase CLIを使ってデプロイします：

```bash
# Supabase CLIのインストール（初回のみ）
npm install -g supabase

# ログイン
supabase login

# プロジェクトのリンク（PROJECT_REFはSupabaseダッシュボードのURLから確認）
supabase link --project-ref YOUR_PROJECT_REF

# ANTHROPIC_API_KEYをシークレットとして登録
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxx

# Edge Functionをデプロイ
supabase functions deploy claude-proxy
```

## 5. js/config.js の更新

以下の情報をSupabaseダッシュボードから取得して `js/config.js` に記入：

| 設定項目 | 取得場所 |
|---------|---------|
| SUPABASE_URL | Settings → API → Project URL |
| SUPABASE_ANON_KEY | Settings → API → anon public (Project API keys) |
| EDGE_FUNCTION_BASE_URL | `https://[project-ref].supabase.co/functions/v1` |

例：
```js
window.APP_CONFIG = {
  SUPABASE_URL: 'https://abcdefghij.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  EDGE_FUNCTION_BASE_URL: 'https://abcdefghij.supabase.co/functions/v1',
};
```

## 6. GitHub Pagesへのデプロイ

1. GitHubリポジトリを作成（Public推奨）
2. `jigsaw-app/` 配下のファイルをリポジトリのルートにプッシュ
3. Settings → Pages → Source: "Deploy from a branch" → `main` ブランチ
4. `https://[username].github.io/[repo-name]/` でアクセス可能

## URL構成

| ページ | URL |
|-------|-----|
| 生徒用入室 | `https://[domain]/index.html` |
| 教師用ログイン | `https://[domain]/teacher/index.html` |

## セキュリティに関する注意

- `SUPABASE_ANON_KEY` はブラウザで閲覧可能ですが、RLSポリシーで操作を制限しているため問題ありません
- `ANTHROPIC_API_KEY` はEdge Functionのシークレットとして管理されており、ブラウザには公開されません
- 教師パスワードはSupabase Authで管理されます
