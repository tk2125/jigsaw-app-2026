// =============================================
// Supabase クライアント & DB操作
// =============================================

// Supabaseクライアント初期化
(function () {
  const { createClient } = supabase;
  window.supabaseClient = createClient(
    window.APP_CONFIG.SUPABASE_URL,
    window.APP_CONFIG.SUPABASE_ANON_KEY
  );
})();

window.DB = {
  _sb: window.supabaseClient,

  // =========================================
  // 生徒向け: 入室・セッション管理
  // =========================================

  // パスワードで授業を検索してアクティブなlesson_sessionを返す
  async findLessonByPassword(inputPassword) {
    const normalized = Utils.normalizeString(inputPassword);

    // 全lessonsを取得してJS側でパスワード照合
    const { data: lessons, error } = await this._sb
      .from('lessons')
      .select('*');
    if (error) throw error;

    const matched = lessons.find(l =>
      Array.isArray(l.passwords) && l.passwords.includes(normalized)
    );
    if (!matched) return null;

    // アクティブなlesson_sessionを取得
    const { data: sessions, error: sErr } = await this._sb
      .from('lesson_sessions')
      .select('*')
      .eq('lesson_id', matched.id)
      .eq('is_active', true)
      .limit(1);
    if (sErr) throw sErr;
    if (!sessions || sessions.length === 0) return null;

    const lessonSession = sessions[0];

    // 資料を取得
    const { data: materials, error: mErr } = await this._sb
      .from('lesson_materials')
      .select('*')
      .eq('lesson_id', matched.id);
    if (mErr) throw mErr;

    const materialsMap = {};
    (materials || []).forEach(m => { materialsMap[m.suit] = m.content; });

    return {
      lesson: matched,
      lessonSession,
      materials: materialsMap,
    };
  },

  // IDでstudent_sessionを取得
  async getStudentSessionById(sessionId) {
    const { data, error } = await this._sb
      .from('student_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();
    if (error) throw error;
    return data;
  },

  // 同suit+card_numberの既存セッションを検索
  async findExistingStudentSession(lessonSessionId, suit, cardNumber) {
    const { data, error } = await this._sb
      .from('student_sessions')
      .select('*')
      .eq('lesson_session_id', lessonSessionId)
      .eq('suit', suit)
      .eq('card_number', cardNumber)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  // 新規student_sessionを作成
  async createStudentSession(lessonSessionId, suit, cardNumber, isJoker) {
    const { data, error } = await this._sb
      .from('student_sessions')
      .insert({
        lesson_session_id: lessonSessionId,
        suit,
        card_number: parseInt(cardNumber),
        is_joker: isJoker,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // 要約を提出
  async submitSummary(sessionId, summaryText) {
    const { error } = await this._sb
      .from('student_sessions')
      .update({
        summary_text: summaryText,
        summary_submitted_at: new Date().toISOString(),
      })
      .eq('id', sessionId);
    if (error) throw error;
  },

  // Opinionを提出
  async submitOpinion(sessionId, { positionChoice, requiredTermsUsed, opinionText, rubricLogicScore, rubricSourceScore }) {
    const { error } = await this._sb
      .from('student_sessions')
      .update({
        position_choice: positionChoice,
        required_terms_used: requiredTermsUsed || [],
        opinion_text: opinionText,
        rubric_logic_score: rubricLogicScore || null,
        rubric_source_score: rubricSourceScore || null,
        opinion_submitted_at: new Date().toISOString(),
      })
      .eq('id', sessionId);
    if (error) throw error;
  },

  // AI対話履歴を保存（upsert: 同タイプの履歴は上書き）
  async saveAiInteraction(studentSessionId, interactionType, messages) {
    // 既存チェック
    const { data: existing } = await this._sb
      .from('ai_interactions')
      .select('id')
      .eq('student_session_id', studentSessionId)
      .eq('interaction_type', interactionType)
      .maybeSingle();

    if (existing) {
      const { error } = await this._sb
        .from('ai_interactions')
        .update({ messages })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await this._sb
        .from('ai_interactions')
        .insert({ student_session_id: studentSessionId, interaction_type: interactionType, messages });
      if (error) throw error;
    }
  },

  // AI対話履歴を取得
  async getAiInteraction(studentSessionId, interactionType) {
    const { data, error } = await this._sb
      .from('ai_interactions')
      .select('*')
      .eq('student_session_id', studentSessionId)
      .eq('interaction_type', interactionType)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  // lesson_sessionの状態を取得（exchange_phase_on等）
  async getLessonSessionStatus(lessonSessionId) {
    const { data, error } = await this._sb
      .from('lesson_sessions')
      .select('*')
      .eq('id', lessonSessionId)
      .single();
    if (error) throw error;
    return data;
  },

  // 意見交換の投稿一覧取得（いいね数含む）
  async getExchangePosts(lessonSessionId, myStudentSessionId) {
    const { data: posts, error } = await this._sb
      .from('exchange_posts')
      .select('id, content, created_at')
      .eq('lesson_session_id', lessonSessionId)
      .order('created_at', { ascending: true });
    if (error) throw error;

    // いいね数を取得
    const { data: likes } = await this._sb
      .from('exchange_likes')
      .select('post_id, student_session_id');

    const likeMap = {};
    const myLikes = new Set();
    (likes || []).forEach(l => {
      likeMap[l.post_id] = (likeMap[l.post_id] || 0) + 1;
      if (l.student_session_id === myStudentSessionId) {
        myLikes.add(l.post_id);
      }
    });

    return (posts || []).map(p => ({
      ...p,
      likeCount: likeMap[p.id] || 0,
      likedByMe: myLikes.has(p.id),
    }));
  },

  // 意見交換に投稿
  async createExchangePost(lessonSessionId, studentSessionId, content) {
    const { data, error } = await this._sb
      .from('exchange_posts')
      .insert({ lesson_session_id: lessonSessionId, student_session_id: studentSessionId, content })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // いいねをトグル
  async toggleLike(postId, studentSessionId) {
    const { data: existing } = await this._sb
      .from('exchange_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('student_session_id', studentSessionId)
      .maybeSingle();

    if (existing) {
      const { error } = await this._sb
        .from('exchange_likes')
        .delete()
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await this._sb
        .from('exchange_likes')
        .insert({ post_id: postId, student_session_id: studentSessionId });
      if (error) throw error;
    }
  },

  // 同じグループ番号のすべてのスートの要約を取得（共有活動用）
  async getSummariesByGroup(lessonSessionId, cardNumber) {
    const { data, error } = await this._sb
      .from('student_sessions')
      .select('suit, summary_text, summary_submitted_at')
      .eq('lesson_session_id', lessonSessionId)
      .eq('card_number', parseInt(cardNumber));
    if (error) throw error;
    return data || [];
  },

  // 立場の集計
  async getPositionStats(lessonSessionId) {
    const { data, error } = await this._sb
      .from('student_sessions')
      .select('position_choice')
      .eq('lesson_session_id', lessonSessionId)
      .not('position_choice', 'is', null);
    if (error) throw error;

    const counts = {};
    (data || []).forEach(s => {
      if (s.position_choice) {
        counts[s.position_choice] = (counts[s.position_choice] || 0) + 1;
      }
    });
    return counts;
  },

  // =========================================
  // 教師向け: 認証
  // =========================================

  async signInTeacher(email, password) {
    const { error } = await this._sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },

  async signOutTeacher() {
    const { error } = await this._sb.auth.signOut();
    if (error) throw error;
  },

  async getTeacherSession() {
    const { data: { session } } = await this._sb.auth.getSession();
    return session;
  },

  // =========================================
  // 教師向け: 年度・クラス管理
  // =========================================

  async getAcademicYears() {
    const { data, error } = await this._sb
      .from('academic_years')
      .select('*')
      .order('year_label', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async createAcademicYear(yearLabel) {
    const { data, error } = await this._sb
      .from('academic_years')
      .insert({ year_label: yearLabel })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteAcademicYear(id) {
    const { error } = await this._sb
      .from('academic_years')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  async getClasses(yearId) {
    const { data, error } = await this._sb
      .from('classes')
      .select('*')
      .eq('year_id', yearId)
      .order('name');
    if (error) throw error;
    return data || [];
  },

  async createClass(yearId, name) {
    const { data, error } = await this._sb
      .from('classes')
      .insert({ year_id: yearId, name })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteClass(id) {
    const { error } = await this._sb
      .from('classes')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // =========================================
  // 教師向け: 授業CRUD
  // =========================================

  async getLessons() {
    const { data, error } = await this._sb
      .from('lessons')
      .select('id, name, suit_count, position_type, expert_timer_minutes, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getLesson(id) {
    const { data: lesson, error } = await this._sb
      .from('lessons')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;

    const { data: mats, error: mErr } = await this._sb
      .from('lesson_materials')
      .select('*')
      .eq('lesson_id', id);
    if (mErr) throw mErr;

    const materials = {};
    const keywords = {};
    (mats || []).forEach(m => {
      materials[m.suit] = m.content;
      keywords[m.suit] = m.keywords || [];
    });

    return { lesson, materials, keywords };
  },

  async createLesson(data) {
    const { data: { session } } = await this._sb.auth.getSession();
    const { data: created, error } = await this._sb
      .from('lessons')
      .insert({ ...data, teacher_id: session?.user?.id })
      .select()
      .single();
    if (error) throw error;
    return created;
  },

  async updateLesson(id, data) {
    const { data: updated, error } = await this._sb
      .from('lessons')
      .update(data)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return updated;
  },

  async deleteLesson(id) {
    const { error } = await this._sb
      .from('lessons')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // 資料をupsert
  async saveMaterial(lessonId, suit, content, keywords) {
    const { error } = await this._sb
      .from('lesson_materials')
      .upsert({ lesson_id: lessonId, suit, content, keywords: keywords || [] }, { onConflict: 'lesson_id,suit' });
    if (error) throw error;
  },

  // =========================================
  // 教師向け: lesson_sessions管理
  // =========================================

  async getLessonSessions(lessonId) {
    const { data, error } = await this._sb
      .from('lesson_sessions')
      .select('*, classes(name)')
      .eq('lesson_id', lessonId)
      .order('session_date', { ascending: false });
    if (error) throw error;
    return (data || []).map(s => ({
      ...s,
      class_name: s.classes?.name || '不明',
    }));
  },

  async createLessonSession(lessonId, classId, sessionDate) {
    const { data, error } = await this._sb
      .from('lesson_sessions')
      .insert({ lesson_id: lessonId, class_id: classId, session_date: sessionDate })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteLessonSession(id) {
    const { error } = await this._sb
      .from('lesson_sessions')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // 同一lesson_idの全セッションを非アクティブ化してから指定セッションをアクティブに
  async setActiveSession(lessonSessionId) {
    // まず対象セッションのlesson_idを取得
    const { data: target, error: tErr } = await this._sb
      .from('lesson_sessions')
      .select('lesson_id')
      .eq('id', lessonSessionId)
      .single();
    if (tErr) throw tErr;

    // 同一lessonの全セッションを非アクティブ化
    const { error: deErr } = await this._sb
      .from('lesson_sessions')
      .update({ is_active: false })
      .eq('lesson_id', target.lesson_id);
    if (deErr) throw deErr;

    // 指定セッションをアクティブ化
    const { error } = await this._sb
      .from('lesson_sessions')
      .update({ is_active: true })
      .eq('id', lessonSessionId);
    if (error) throw error;
  },

  async deactivateSession(lessonSessionId) {
    const { error } = await this._sb
      .from('lesson_sessions')
      .update({ is_active: false })
      .eq('id', lessonSessionId);
    if (error) throw error;
  },

  async setExchangePhase(lessonSessionId, enabled) {
    const { error } = await this._sb
      .from('lesson_sessions')
      .update({ exchange_phase_on: enabled })
      .eq('id', lessonSessionId);
    if (error) throw error;
  },

  // =========================================
  // 教師向け: ダッシュボード・エクスポート
  // =========================================

  async getDashboardData(lessonSessionId) {
    const { data: students, error } = await this._sb
      .from('student_sessions')
      .select('*')
      .eq('lesson_session_id', lessonSessionId)
      .order('suit')
      .order('card_number');
    if (error) throw error;

    const list = students || [];
    const summarySubmitted = list.filter(s => s.summary_submitted_at).length;
    const opinionSubmitted = list.filter(s => s.opinion_submitted_at).length;

    // 立場集計
    const positionStats = {};
    list.forEach(s => {
      if (s.position_choice) {
        positionStats[s.position_choice] = (positionStats[s.position_choice] || 0) + 1;
      }
    });

    // 使用語句集計
    const termUsageCounts = {};
    list.forEach(s => {
      (s.required_terms_used || []).forEach(t => {
        termUsageCounts[t] = (termUsageCounts[t] || 0) + 1;
      });
    });

    return {
      totalStudents: list.length,
      summarySubmitted,
      opinionSubmitted,
      positionStats,
      students: list,
      termUsageCounts,
    };
  },

  async getExportData(lessonSessionId) {
    const { data, error } = await this._sb
      .from('student_sessions')
      .select('*')
      .eq('lesson_session_id', lessonSessionId)
      .order('suit')
      .order('card_number');
    if (error) throw error;
    return data || [];
  },

  // =========================================
  // 生徒向け: 共有活動掲示板
  // =========================================

  // sharing_postsを取得（targetSuit=nullで全スート）
  async getSharingPosts(lessonSessionId, cardNumber, isPublic, targetSuit) {
    let query = this._sb
      .from('sharing_posts')
      .select('*')
      .eq('lesson_session_id', lessonSessionId)
      .order('created_at', { ascending: true });

    if (targetSuit) {
      query = query.eq('target_suit', targetSuit);
    }
    if (!isPublic) {
      query = query.eq('card_number', cardNumber);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async createSharingPost({ lesson_session_id, card_number, suit, post_type, content, target_suit }) {
    const { data, error } = await this._sb
      .from('sharing_posts')
      .insert({ lesson_session_id, card_number, suit, post_type, content, target_suit })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // =========================================
  // 教師向け: 共有活動公開制御
  // =========================================

  async setSharingPublic(lessonSessionId, enabled) {
    const { error } = await this._sb
      .from('lesson_sessions')
      .update({ sharing_public: enabled })
      .eq('id', lessonSessionId);
    if (error) throw error;
  },

  // =========================================
  // 重複入室ログ
  // =========================================

  async recordDuplicateEntry(lessonSessionId, suit, cardNumber) {
    const { error } = await this._sb
      .from('duplicate_entries')
      .insert({ lesson_session_id: lessonSessionId, suit, card_number: cardNumber });
    if (error) throw error;
  },

  async getDuplicateEntries(lessonSessionId) {
    const { data, error } = await this._sb
      .from('duplicate_entries')
      .select('*')
      .eq('lesson_session_id', lessonSessionId)
      .order('occurred_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // =========================================
  // AI対話ログ（教師向け）
  // =========================================

  async getAiInteractionsBySession(lessonSessionId) {
    const { data: sessions, error: sErr } = await this._sb
      .from('student_sessions')
      .select('id, suit, card_number')
      .eq('lesson_session_id', lessonSessionId);
    if (sErr) throw sErr;
    if (!sessions || sessions.length === 0) return [];

    const sessionIds = sessions.map(s => s.id);
    const sessionMap = {};
    sessions.forEach(s => { sessionMap[s.id] = s; });

    const { data, error } = await this._sb
      .from('ai_interactions')
      .select('*')
      .in('student_session_id', sessionIds)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return (data || []).map(row => ({
      ...row,
      suit: sessionMap[row.student_session_id]?.suit,
      card_number: sessionMap[row.student_session_id]?.card_number,
    }));
  },

  // 全lesson_sessionsをlesson名・class名付きで取得（ダッシュボード一覧用）
  async getAllLessonSessions() {
    const { data, error } = await this._sb
      .from('lesson_sessions')
      .select('*, lessons(name), classes(name)')
      .order('session_date', { ascending: false });
    if (error) throw error;
    return (data || []).map(s => ({
      ...s,
      lesson_name: s.lessons?.name || '不明',
      class_name: s.classes?.name || '不明',
    }));
  },
};
