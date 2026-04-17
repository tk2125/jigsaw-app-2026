-- ===========================================
-- Phase 1 RLS強化マイグレーション
-- 適用場所: Supabase Dashboard → SQL Editor
-- 適用日: 授業前に必ず実行すること
-- ===========================================

-- -----------------------------------------------
-- sharing_posts: FOR ALL を廃止し SELECT/INSERT のみに制限
-- (UPDATE/DELETE は anon には付与しない)
-- -----------------------------------------------
DROP POLICY IF EXISTS "anon_all_sharing_posts" ON sharing_posts;

CREATE POLICY "anon_select_sharing_posts" ON sharing_posts
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_sharing_posts" ON sharing_posts
  FOR INSERT TO anon WITH CHECK (true);

-- -----------------------------------------------
-- ai_interactions: FOR ALL を廃止し SELECT/INSERT のみに制限
-- (UPDATE/DELETE は anon には付与しない)
-- -----------------------------------------------
DROP POLICY IF EXISTS "anon_all_ai_interactions" ON ai_interactions;

CREATE POLICY "anon_select_ai_interactions" ON ai_interactions
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_ai_interactions" ON ai_interactions
  FOR INSERT TO anon WITH CHECK (true);

-- -----------------------------------------------
-- 確認: 変更後のポリシー一覧
-- -----------------------------------------------
SELECT schemaname, tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('sharing_posts', 'ai_interactions')
ORDER BY tablename, policyname;


-- ===========================================
-- 追加: B-9 post_type CHECK制約 (適用は保留)
-- 注意: 既存データに違反行がある場合はエラーになります。
--       先に以下のSELECTで違反データがないか確認してから実行してください。
-- ===========================================

-- 確認クエリ(先に実行):
-- SELECT id, post_type FROM sharing_posts
-- WHERE post_type NOT IN ('question', 'note', 'expert_reply');

-- 上記で0件を確認してから以下を実行:
-- ALTER TABLE sharing_posts ADD CONSTRAINT post_type_valid
--   CHECK (post_type IN ('question', 'note', 'expert_reply'));
