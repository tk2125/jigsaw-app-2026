// =============================================
// 意見交換フェーズページ ロジック
// =============================================
(function () {
  let pollInterval = null;
  let isExchangeOn = false;
  let lessonData = null;
  let mySessionId = null;
  let myPosition = null;

  const POLL_INTERVAL_MS = 10000; // 10秒

  // =============================================
  // 初期化
  // =============================================
  document.addEventListener('DOMContentLoaded', async () => {
    if (!Utils.hasValidSession()) {
      window.location.href = '../index.html';
      return;
    }

    lessonData = Utils.getLessonData();
    if (!lessonData) {
      window.location.href = '../index.html';
      return;
    }

    mySessionId = sessionStorage.getItem(Utils.SESSION_KEYS.SESSION_ID);
    const suit = sessionStorage.getItem(Utils.SESSION_KEYS.SUIT);
    const cardNum = sessionStorage.getItem(Utils.SESSION_KEYS.CARD_NUMBER);

    // ヘッダー
    const badge = document.getElementById('trump-badge');
    badge.textContent = `${suit} ${Utils.cardNumberToLabel(cardNum)}`;
    badge.style.color = Utils.suitToColor(suit);

    // 自分の立場を取得
    try {
      const session = await DB.getStudentSessionById(mySessionId);
      myPosition = session?.position_choice || null;
    } catch (e) {
      // エラー無視
    }

    // 立場タイプに応じてグラフセクション表示制御
    const positionType = lessonData.lesson.position_type;
    if (positionType === 'free') {
      document.getElementById('position-chart-section').classList.add('hidden');
    }

    // 初回チェック
    await checkAndUpdate();

    // ポーリング開始
    pollInterval = setInterval(checkAndUpdate, POLL_INTERVAL_MS);

    // 投稿ボタン
    document.getElementById('btn-post').addEventListener('click', handlePost);
    document.getElementById('post-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.ctrlKey) handlePost();
    });

    // ページ離脱時にポーリングを停止
    window.addEventListener('beforeunload', () => {
      if (pollInterval) clearInterval(pollInterval);
    });
  });

  // =============================================
  // 状態チェック & UI更新
  // =============================================
  async function checkAndUpdate() {
    try {
      const lessonSessionId = sessionStorage.getItem(Utils.SESSION_KEYS.LESSON_SESSION_ID);
      const status = await DB.getLessonSessionStatus(lessonSessionId);

      if (status.exchange_phase_on && !isExchangeOn) {
        // 意見交換フェーズ開始
        isExchangeOn = true;
        document.getElementById('waiting-screen').classList.add('hidden');
        document.getElementById('exchange-content').classList.remove('hidden');
      } else if (!status.exchange_phase_on && isExchangeOn) {
        // フェーズ終了（まれなケース）
        isExchangeOn = false;
        document.getElementById('exchange-content').classList.add('hidden');
        document.getElementById('waiting-screen').classList.remove('hidden');
      }

      if (isExchangeOn) {
        await updateExchangeContent(lessonSessionId);
      }
    } catch (err) {
      // サイレントエラー（ポーリングなのでUI表示しない）
      console.warn('Poll error:', err.message);
    }
  }

  // =============================================
  // 意見交換コンテンツ更新
  // =============================================
  async function updateExchangeContent(lessonSessionId) {
    const [posts, positionStats] = await Promise.all([
      DB.getExchangePosts(lessonSessionId, mySessionId),
      DB.getPositionStats(lessonSessionId),
    ]);

    updatePositionChart(positionStats);
    updatePostBoard(posts);
  }

  // =============================================
  // 立場分布グラフ更新
  // =============================================
  function updatePositionChart(positionStats) {
    const chart = document.getElementById('position-chart');
    const lesson = lessonData.lesson;
    const positionType = lesson.position_type;

    if (positionType === 'free') return;

    const positions = [
      { key: 'A', label: lesson.position_a_label || 'A' },
      { key: 'B', label: lesson.position_b_label || 'B' },
    ];
    if (positionType === 'ternary') {
      positions.push({ key: 'C', label: lesson.position_c_label || 'C' });
    }

    const total = Object.values(positionStats).reduce((a, b) => a + b, 0) || 1;
    const maxCount = Math.max(...positions.map(p => positionStats[p.key] || 0), 1);

    chart.innerHTML = positions.map(p => {
      const count = positionStats[p.key] || 0;
      const pct = Math.round((count / total) * 100);
      const isMe = myPosition === p.key;
      return `
        <div class="bar-row">
          <div class="bar-label">${p.key}：${p.label}</div>
          <div class="bar-track">
            <div class="bar-fill ${isMe ? 'my-choice' : ''}" style="width: ${pct}%;">
              ${pct > 10 ? pct + '%' : ''}
            </div>
          </div>
          <div class="bar-count">${count}人</div>
        </div>
      `;
    }).join('');
  }

  // =============================================
  // 投稿ボード更新
  // =============================================
  function updatePostBoard(posts) {
    const board = document.getElementById('post-board');
    const empty = document.getElementById('posts-empty');

    if (!posts || posts.length === 0) {
      board.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }

    empty.classList.add('hidden');
    board.innerHTML = posts.map(post => {
      const timeStr = post.created_at
        ? new Date(post.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
        : '';
      const likedClass = post.likedByMe ? 'liked' : '';
      return `
        <div class="post-card" data-post-id="${post.id}">
          <div class="post-content">${escapeHtml(post.content)}</div>
          <div class="post-footer">
            <span class="post-time">${timeStr}</span>
            <button class="like-btn ${likedClass}" data-post-id="${post.id}">
              👍 <span class="like-count">${post.likeCount}</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // いいねボタンのイベント設定
    board.querySelectorAll('.like-btn').forEach(btn => {
      btn.addEventListener('click', () => handleLike(btn.dataset.postId, btn));
    });

    // 最新投稿までスクロール（新規追加時のみ）
  }

  // =============================================
  // 投稿処理
  // =============================================
  async function handlePost() {
    const input = document.getElementById('post-input');
    const content = input.value.trim();
    if (!content) {
      Utils.showError('投稿内容を入力してください');
      return;
    }

    const lessonSessionId = sessionStorage.getItem(Utils.SESSION_KEYS.LESSON_SESSION_ID);
    const btn = document.getElementById('btn-post');
    btn.disabled = true;

    try {
      await DB.createExchangePost(lessonSessionId, mySessionId, content);
      input.value = '';
      Utils.showSuccess('投稿しました');
      // 即時更新
      await updateExchangeContent(lessonSessionId);
    } catch (err) {
      Utils.showError('投稿に失敗しました: ' + err.message);
    } finally {
      btn.disabled = false;
    }
  }

  // =============================================
  // いいね処理
  // =============================================
  async function handleLike(postId, btn) {
    btn.disabled = true;
    try {
      await DB.toggleLike(postId, mySessionId);
      // UIを即時更新
      const isLiked = btn.classList.contains('liked');
      const countEl = btn.querySelector('.like-count');
      const currentCount = parseInt(countEl.textContent) || 0;

      if (isLiked) {
        btn.classList.remove('liked');
        countEl.textContent = Math.max(0, currentCount - 1);
      } else {
        btn.classList.add('liked');
        countEl.textContent = currentCount + 1;
      }
    } catch (err) {
      Utils.showError('エラーが発生しました');
    } finally {
      btn.disabled = false;
    }
  }

  // XSS対策
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/\n/g, '<br>');
  }

})();
