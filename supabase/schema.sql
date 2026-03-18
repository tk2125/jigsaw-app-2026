-- ジグソー授業支援アプリ Supabase スキーマ
-- 実行場所: Supabase ダッシュボード → SQL Editor

-- UUID拡張の有効化
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===========================================
-- テーブル定義
-- ===========================================

-- 1. 年度
CREATE TABLE academic_years (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  year_label TEXT NOT NULL,  -- 例: "2025年度"
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. クラス
CREATE TABLE classes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  year_id UUID REFERENCES academic_years(id) ON DELETE CASCADE,
  name TEXT NOT NULL,  -- 例: "高1-A"
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 授業テンプレート
CREATE TABLE lessons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  passwords TEXT[] NOT NULL DEFAULT '{}',
  -- パスワードはDB保存時に正規化済み（小文字・半角）
  suit_count INTEGER NOT NULL DEFAULT 3 CHECK (suit_count IN (3, 4)),
  central_question TEXT NOT NULL DEFAULT '',
  position_type TEXT NOT NULL DEFAULT 'binary'
    CHECK (position_type IN ('binary', 'ternary', 'free')),
  position_a_label TEXT NOT NULL DEFAULT 'A',
  position_b_label TEXT NOT NULL DEFAULT 'B',
  position_c_label TEXT DEFAULT 'C',
  required_terms TEXT[] NOT NULL DEFAULT '{}',
  rubric_logic_criteria TEXT NOT NULL DEFAULT '',
  rubric_source_criteria TEXT NOT NULL DEFAULT '',
  remainder_type TEXT NOT NULL DEFAULT 'joker'
    CHECK (remainder_type IN ('priority_suit', 'joker')),
  priority_suit TEXT DEFAULT NULL,  -- '♤','♧','♡','♢' のいずれか
  expert_timer_minutes INTEGER NOT NULL DEFAULT 15,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 各スートの資料
CREATE TABLE lesson_materials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
  suit TEXT NOT NULL CHECK (suit IN ('♤', '♧', '♡', '♢')),
  content TEXT NOT NULL DEFAULT '',
  UNIQUE(lesson_id, suit)
);

-- 5. 授業×クラスの実施記録
CREATE TABLE lesson_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  exchange_phase_on BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 同一lessonに対してアクティブなセッションは1つだけ
-- ※異なるlessonは同時にアクティブになれる（クラスごとに別授業を使う場合）
CREATE UNIQUE INDEX lesson_sessions_one_active_per_lesson
  ON lesson_sessions(lesson_id)
  WHERE is_active = TRUE;

-- 6. 生徒の参加記録
CREATE TABLE student_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_session_id UUID REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  suit TEXT NOT NULL,
  card_number INTEGER NOT NULL CHECK (card_number BETWEEN 1 AND 13),
  is_joker BOOLEAN NOT NULL DEFAULT FALSE,
  -- エキスパート活動
  summary_text TEXT,
  summary_submitted_at TIMESTAMPTZ,
  -- Opinionシート
  position_choice TEXT,
  required_terms_used TEXT[] DEFAULT '{}',
  opinion_text TEXT,
  rubric_logic_score TEXT
    CHECK (rubric_logic_score IN ('A','B','C','D','E','F') OR rubric_logic_score IS NULL),
  rubric_source_score TEXT
    CHECK (rubric_source_score IN ('A','B','C','D','E','F') OR rubric_source_score IS NULL),
  opinion_submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lesson_session_id, suit, card_number)
);

-- 7. AI対話履歴
CREATE TABLE ai_interactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_session_id UUID REFERENCES student_sessions(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL
    CHECK (interaction_type IN ('summary_feedback', 'explanation', 'opinion_feedback')),
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. 意見交換ボード投稿
CREATE TABLE exchange_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_session_id UUID REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  student_session_id UUID REFERENCES student_sessions(id) ON DELETE SET NULL,
  -- student_session_idは教師のみ参照可（RLSで制御）
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. 共感（いいね）
CREATE TABLE exchange_likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID REFERENCES exchange_posts(id) ON DELETE CASCADE,
  student_session_id UUID REFERENCES student_sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, student_session_id)  -- 二重いいね防止
);

-- ===========================================
-- RLS（行レベルセキュリティ）設定
-- ===========================================

ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_likes ENABLE ROW LEVEL SECURITY;

-- academic_years: 誰でも読める、教師（認証ユーザー）は全操作
CREATE POLICY "anon_read_academic_years" ON academic_years
  FOR SELECT TO anon USING (true);
CREATE POLICY "auth_all_academic_years" ON academic_years
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- classes
CREATE POLICY "anon_read_classes" ON classes
  FOR SELECT TO anon USING (true);
CREATE POLICY "auth_all_classes" ON classes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- lessons
CREATE POLICY "anon_read_lessons" ON lessons
  FOR SELECT TO anon USING (true);
CREATE POLICY "auth_all_lessons" ON lessons
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- lesson_materials
CREATE POLICY "anon_read_lesson_materials" ON lesson_materials
  FOR SELECT TO anon USING (true);
CREATE POLICY "auth_all_lesson_materials" ON lesson_materials
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- lesson_sessions: 生徒は全件読める（アクティブ検索のため）
CREATE POLICY "anon_read_lesson_sessions" ON lesson_sessions
  FOR SELECT TO anon USING (true);
CREATE POLICY "auth_all_lesson_sessions" ON lesson_sessions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- student_sessions: 生徒はINSERT・SELECT・UPDATE可（クライアント側でIDを管理）
CREATE POLICY "anon_insert_student_sessions" ON student_sessions
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_select_student_sessions" ON student_sessions
  FOR SELECT TO anon USING (true);
CREATE POLICY "anon_update_student_sessions" ON student_sessions
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_student_sessions" ON student_sessions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ai_interactions
CREATE POLICY "anon_all_ai_interactions" ON ai_interactions
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_ai_interactions" ON ai_interactions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- exchange_posts: student_session_idは全員参照可だが、教師画面でのみ利用
CREATE POLICY "anon_read_exchange_posts" ON exchange_posts
  FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_exchange_posts" ON exchange_posts
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "auth_all_exchange_posts" ON exchange_posts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- exchange_likes
CREATE POLICY "anon_all_exchange_likes" ON exchange_likes
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_exchange_likes" ON exchange_likes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===========================================
-- マイグレーション: teacher_id・entry_message追加 & RLS更新
-- Supabase ダッシュボード → SQL Editor で実行してください
-- ===========================================

-- lessonsにteacher_idとentry_messageを追加
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES auth.users(id);
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS entry_message TEXT NOT NULL DEFAULT '';

-- 注意: 既存授業データのteacher_idはNULLになります。
-- 引き継ぐ場合は以下で手動更新してください（UUIDはダッシュボード → Authentication → Users で確認）:
-- UPDATE lessons SET teacher_id = '<your-user-uuid>' WHERE teacher_id IS NULL;

-- 既存の教師用全操作ポリシーを削除し、teacher_idベースに変更
DROP POLICY IF EXISTS "auth_all_lessons" ON lessons;
CREATE POLICY "auth_select_own_lessons" ON lessons
  FOR SELECT TO authenticated USING (auth.uid() = teacher_id);
CREATE POLICY "auth_insert_own_lessons" ON lessons
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = teacher_id);
CREATE POLICY "auth_update_own_lessons" ON lessons
  FOR UPDATE TO authenticated USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);
CREATE POLICY "auth_delete_own_lessons" ON lessons
  FOR DELETE TO authenticated USING (auth.uid() = teacher_id);

-- lesson_materials: 自分のlessonに紐づくもののみ
DROP POLICY IF EXISTS "auth_all_lesson_materials" ON lesson_materials;
CREATE POLICY "auth_crud_own_lesson_materials" ON lesson_materials
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM lessons WHERE lessons.id = lesson_materials.lesson_id AND lessons.teacher_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM lessons WHERE lessons.id = lesson_materials.lesson_id AND lessons.teacher_id = auth.uid()
  ));

-- lesson_sessions: 自分のlessonに紐づくもののみ
DROP POLICY IF EXISTS "auth_all_lesson_sessions" ON lesson_sessions;
CREATE POLICY "auth_crud_own_lesson_sessions" ON lesson_sessions
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM lessons WHERE lessons.id = lesson_sessions.lesson_id AND lessons.teacher_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM lessons WHERE lessons.id = lesson_sessions.lesson_id AND lessons.teacher_id = auth.uid()
  ));
