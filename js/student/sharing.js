// =============================================
// 共有活動ページ ロジック（掲示板形式）
// =============================================
(function () {
  const REFRESH_INTERVAL = 30;
  const SUITS_ALL = ['♤', '♧', '♡', '♢'];

  let suit = null;          // 自分のスート
  let cardNumber = null;    // 自分のグループ番号
  let lessonSessionId = null;
  let lessonData = null;
  let activeSuit = null;    // 現在表示中のタブのスート
  let summariesCache = {};  // { suit: record }
  let postsCache = [];      // 現在のタブの投稿一覧
  let isPublic = false;     // sharing_public フラグ
  let suits = [];           // 使用中のスート一覧

  let countdown = REFRESH_INTERVAL;
  let countdownTimer = null;
  let realtimeChannel = null;

  // =============================================
  // 初期化
  // =============================================
  document.addEventListener('DOMContentLoaded', async () => {
    if (!Utils.hasValidSession()) {
      window.location.href = '../index.html';
      return;
    }

    suit = sessionStorage.getItem(Utils.SESSION_KEYS.SUIT);
    cardNumber = parseInt(sessionStorage.getItem(Utils.SESSION_KEYS.CARD_NUMBER));
    lessonSessionId = sessionStorage.getItem(Utils.SESSION_KEYS.LESSON_SESSION_ID);
    lessonData = Utils.getLessonData();

    if (!suit || !cardNumber || !lessonSessionId) {
      window.location.href = '../index.html';
      return;
    }

    // ヘッダー
    const badge = document.getElementById('trump-badge');
    badge.textContent = `${suit} ${Utils.cardNumberToLabel(cardNumber)}`;
    badge.style.color = Utils.suitToColor(suit);
    document.getElementById('group-number').textContent = Utils.cardNumberToLabel(cardNumber);

    // 使用スート一覧
    const suitCount = lessonData?.lesson?.suit_count || 3;
    suits = suitCount === 4 ? SUITS_ALL : SUITS_ALL.slice(0, 3);
    activeSuit = suits[0];

    // sharing_public を取得
    try {
      const status = await DB.getLessonSessionStatus(lessonSessionId);
      isPublic = status.sharing_public || false;
    } catch (e) { /* デフォルト false */ }

    // タブ描画
    renderSuitTabs();

    // データ読み込み
    Utils.setLoading(true);
    await loadAllSummaries();
    // 自分のスートのタブに切り替え
    switchTab(suit);
    await loadPosts();
    Utils.setLoading(false);

    // Realtimeサブスクリプション
    setupRealtime();

    // 30秒ポーリング（フォールバック）
    startCountdown();

    // 手動更新
    document.getElementById('btn-refresh').addEventListener('click', async () => {
      resetCountdown();
      Utils.setLoading(true);
      await loadAllSummaries();
      await loadPosts();
      Utils.setLoading(false);
    });

    // 投稿ボタン
    document.getElementById('btn-post').addEventListener('click', handlePost);

    // 次へ
    document.getElementById('btn-to-opinion').addEventListener('click', () => {
      window.location.href = 'opinion.html';
    });

    window.addEventListener('beforeunload', cleanup);
  });

  // =============================================
  // スートタブ
  // =============================================
  function renderSuitTabs() {
    const row = document.getElementById('suit-tab-row');
    row.innerHTML = suits.map(s => `
      <button class="suit-tab-btn ${s === activeSuit ? 'active' : ''}"
        data-suit="${s}" style="color:${Utils.suitToColor(s)}">
        ${s} ${Utils.suitToName(s)}
        ${s === suit ? '<span class="my-suit-mark">自分</span>' : ''}
      </button>
    `).join('');

    row.querySelectorAll('.suit-tab-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        switchTab(btn.dataset.suit);
        await loadPosts();
      });
    });
  }

  function switchTab(targetSuit) {
    activeSuit = targetSuit;

    document.querySelectorAll('.suit-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.suit === targetSuit);
    });

    // エキスパート回答：自分のスートのタブのみ表示
    const expertOption = document.getElementById('expert-reply-option');
    if (targetSuit === suit) {
      expertOption.style.display = '';
    } else {
      expertOption.style.display = 'none';
      const checked = document.querySelector('input[name="post-type"]:checked');
      if (checked?.value === 'expert_reply') {
        document.querySelector('input[name="post-type"][value="question"]').checked = true;
      }
    }

    renderActiveSummary();
    renderPosts();
  }

  // =============================================
  // 要約読み込み・描画
  // =============================================
  async function loadAllSummaries() {
    try {
      const records = await DB.getSummariesByGroup(lessonSessionId, cardNumber);
      summariesCache = {};
      records.forEach(r => { summariesCache[r.suit] = r; });
    } catch (err) {
      Utils.showError('要約の読み込みに失敗しました: ' + err.message);
    }
  }

  function renderActiveSummary() {
    const area = document.getElementById('active-summary-area');
    const record = summariesCache[activeSuit];
    const isMine = (activeSuit === suit);
    const color = Utils.suitToColor(activeSuit);

    if (record?.summary_text) {
      area.innerHTML = `
        <div class="summary-display ${isMine ? 'is-mine' : ''}" style="border-left: 4px solid ${color};">
          <div class="summary-display-text">${Utils._escapeHtml(record.summary_text)}</div>
          ${record.summary_submitted_at
            ? `<div class="summary-time">${Utils.formatTime(record.summary_submitted_at)} に提出</div>`
            : ''}
        </div>
      `;
    } else {
      area.innerHTML = `<p class="summary-pending">⏳ ${Utils.suitToName(activeSuit)}チームの要約はまだ提出されていません</p>`;
    }
  }

  // =============================================
  // 投稿一覧
  // =============================================
  async function loadPosts() {
    if (!lessonSessionId || !activeSuit) return;
    try {
      postsCache = await DB.getSharingPosts(lessonSessionId, cardNumber, isPublic, activeSuit);
      renderPosts();
    } catch (err) {
      console.warn('投稿読み込みエラー:', err.message);
    }
  }

  function renderPosts() {
    const container = document.getElementById('posts-list');
    if (!container) return;

    if (postsCache.length === 0) {
      container.innerHTML = '<p class="text-muted" style="font-size:14px;">まだ投稿がありません</p>';
      return;
    }

    const typeLabel = { question: '質問', note: 'メモ追記', expert_reply: 'エキスパート回答' };
    const typeClass = { question: 'type-question', note: 'type-note', expert_reply: 'type-expert' };

    container.innerHTML = postsCache.map(p => {
      const groupInfo = isPublic
        ? `グループ${Utils.cardNumberToLabel(p.card_number)} / ${Utils.suitToName(p.suit)}`
        : Utils.suitToName(p.suit);
      return `
        <div class="post-item">
          <div class="post-item-header">
            <span class="post-type-badge ${typeClass[p.post_type] || ''}">${typeLabel[p.post_type] || p.post_type}</span>
            <span class="post-meta">${groupInfo} · ${Utils.formatTime(p.created_at)}</span>
          </div>
          <div class="post-content">${Utils._escapeHtml(p.content)}</div>
        </div>
      `;
    }).join('');
  }

  // =============================================
  // 投稿送信
  // =============================================
  async function handlePost() {
    const content = document.getElementById('post-input').value.trim();
    if (!content) {
      Utils.showError('投稿内容を入力してください');
      return;
    }

    const postType = document.querySelector('input[name="post-type"]:checked')?.value || 'question';

    Utils.setLoading(true);
    try {
      const newPost = await DB.createSharingPost({
        lesson_session_id: lessonSessionId,
        card_number: cardNumber,
        suit,
        post_type: postType,
        content,
        target_suit: activeSuit,
      });
      document.getElementById('post-input').value = '';
      // Realtimeが届かなかった場合のフォールバックとして手動で追加
      if (!postsCache.find(p => p.id === newPost.id)) {
        postsCache.push(newPost);
        renderPosts();
      }
      Utils.showSuccess('投稿しました');
    } catch (err) {
      Utils.showError('投稿に失敗しました: ' + err.message);
    } finally {
      Utils.setLoading(false);
    }
  }

  // =============================================
  // Realtime サブスクリプション
  // =============================================
  function setupRealtime() {
    try {
      realtimeChannel = window.supabaseClient
        .channel(`sharing_posts_${lessonSessionId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'sharing_posts',
          filter: `lesson_session_id=eq.${lessonSessionId}`,
        }, (payload) => {
          const post = payload.new;
          // 同グループ（またはpublic時は全グループ）でアクティブタブ対象の投稿
          const isMyGroup = isPublic || (post.card_number === cardNumber);
          if (isMyGroup && !postsCache.find(p => p.id === post.id)) {
            postsCache.push(post);
            if (post.target_suit === activeSuit) {
              renderPosts();
            }
          }
        })
        .subscribe();
    } catch (e) {
      console.warn('Realtime unavailable, polling only');
    }
  }

  // =============================================
  // カウントダウン・ポーリング（フォールバック）
  // =============================================
  function startCountdown() {
    countdown = REFRESH_INTERVAL;
    updateCountdownLabel();
    countdownTimer = setInterval(async () => {
      countdown--;
      updateCountdownLabel();
      if (countdown <= 0) {
        countdown = REFRESH_INTERVAL;
        await loadAllSummaries();
        await loadPosts();
        renderActiveSummary();
      }
    }, 1000);
  }

  function resetCountdown() {
    countdown = REFRESH_INTERVAL;
    updateCountdownLabel();
  }

  function updateCountdownLabel() {
    const el = document.getElementById('refresh-status');
    if (el) el.textContent = countdown > 0 ? `${countdown}秒後に自動更新` : '更新中...';
  }

  function cleanup() {
    if (countdownTimer) clearInterval(countdownTimer);
    if (realtimeChannel) {
      try { realtimeChannel.unsubscribe(); } catch (e) {}
    }
  }

})();
