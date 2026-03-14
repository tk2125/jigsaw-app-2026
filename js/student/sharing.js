// =============================================
// 共有活動ページ ロジック
// =============================================
(function () {
  const MEMO_KEY = 'jigsaw_sharing_memo';
  const REFRESH_INTERVAL = 30;

  let suit = null;
  let cardNumber = null;
  let lessonSessionId = null;
  let lessonData = null;
  let countdown = REFRESH_INTERVAL;
  let countdownTimer = null;
  let summariesCache = [];

  // =============================================
  // 初期化
  // =============================================
  document.addEventListener('DOMContentLoaded', async () => {
    if (!Utils.hasValidSession()) {
      window.location.href = '../index.html';
      return;
    }

    // URLパラメータ優先、なければsessionStorage
    const params = new URLSearchParams(window.location.search);
    suit = params.get('suit') || sessionStorage.getItem(Utils.SESSION_KEYS.SUIT);
    cardNumber = parseInt(params.get('group') || sessionStorage.getItem(Utils.SESSION_KEYS.CARD_NUMBER));
    lessonSessionId = sessionStorage.getItem(Utils.SESSION_KEYS.LESSON_SESSION_ID);
    lessonData = Utils.getLessonData();

    if (!suit || !cardNumber || !lessonSessionId) {
      window.location.href = '../index.html';
      return;
    }

    // ヘッダー描画
    const badge = document.getElementById('trump-badge');
    badge.textContent = `${suit} ${Utils.cardNumberToLabel(cardNumber)}`;
    badge.style.color = Utils.suitToColor(suit);
    document.getElementById('group-number').textContent = Utils.cardNumberToLabel(cardNumber);

    // メモ復元
    const savedMemo = sessionStorage.getItem(MEMO_KEY);
    if (savedMemo) {
      document.getElementById('memo-input').value = savedMemo;
    }

    // メモ自動保存
    document.getElementById('memo-input').addEventListener('input', () => {
      sessionStorage.setItem(MEMO_KEY, document.getElementById('memo-input').value);
    });

    // 要約読み込み
    Utils.setLoading(true);
    await loadSummaries();
    Utils.setLoading(false);

    // 自動更新開始
    startCountdown();

    // 手動更新
    document.getElementById('btn-refresh').addEventListener('click', async () => {
      resetCountdown();
      Utils.setLoading(true);
      await loadSummaries();
      Utils.setLoading(false);
    });

    // コピーボタン
    document.getElementById('btn-copy-md').addEventListener('click', copyMarkdown);
    document.getElementById('btn-copy-text').addEventListener('click', copyPlainText);

    // Opinionへ
    document.getElementById('btn-to-opinion').addEventListener('click', () => {
      window.location.href = 'opinion.html';
    });
  });

  // =============================================
  // 要約読み込み・描画
  // =============================================
  async function loadSummaries() {
    try {
      summariesCache = await DB.getSummariesByGroup(lessonSessionId, cardNumber);
      renderSummaries(summariesCache);
    } catch (err) {
      Utils.showError('要約の読み込みに失敗しました: ' + err.message);
    }
  }

  function renderSummaries(summaries) {
    const suitCount = lessonData?.lesson?.suit_count || 3;
    const suits = suitCount === 4 ? ['♤', '♧', '♡', '♢'] : ['♤', '♧', '♡'];

    const map = {};
    summaries.forEach(s => { map[s.suit] = s; });

    const container = document.getElementById('summaries-list');
    container.innerHTML = '';

    suits.forEach(s => {
      const record = map[s];
      const isMine = (s === suit);

      const card = document.createElement('div');
      card.className = 'summary-card' + (isMine ? ' my-suit' : '');

      const suitColor = Utils.suitToColor(s);
      const suitLabel = `${s} ${Utils.suitToName(s)}チーム`;

      let badgeHtml = '';
      if (isMine) {
        badgeHtml = '<span class="summary-badge mine">自分</span>';
      } else if (record?.summary_submitted_at) {
        badgeHtml = '<span class="summary-badge">提出済み</span>';
      }

      let bodyHtml;
      if (record?.summary_text) {
        const timeStr = record.summary_submitted_at
          ? Utils.formatTime(record.summary_submitted_at) + ' に提出'
          : '';
        bodyHtml = `
          <div class="summary-text">${Utils._escapeHtml(record.summary_text)}</div>
          ${timeStr ? `<div class="summary-time">${timeStr}</div>` : ''}
        `;
      } else {
        bodyHtml = '<div class="summary-pending">⏳ 発表待ち...</div>';
      }

      card.innerHTML = `
        <div class="summary-card-header">
          <span class="summary-suit-label" style="color:${suitColor}">${suitLabel}</span>
          ${badgeHtml}
        </div>
        ${bodyHtml}
      `;
      container.appendChild(card);
    });
  }

  // =============================================
  // カウントダウン・自動更新
  // =============================================
  function startCountdown() {
    countdown = REFRESH_INTERVAL;
    updateCountdownLabel();
    countdownTimer = setInterval(async () => {
      countdown--;
      updateCountdownLabel();
      if (countdown <= 0) {
        countdown = REFRESH_INTERVAL;
        await loadSummaries();
      }
    }, 1000);
  }

  function resetCountdown() {
    countdown = REFRESH_INTERVAL;
    updateCountdownLabel();
  }

  function updateCountdownLabel() {
    const el = document.getElementById('refresh-status');
    if (countdown > 0) {
      el.textContent = `${countdown}秒後に自動更新`;
    } else {
      el.textContent = '更新中...';
    }
  }

  // =============================================
  // コピー機能
  // =============================================
  function buildContent(format) {
    const suitCount = lessonData?.lesson?.suit_count || 3;
    const suits = suitCount === 4 ? ['♤', '♧', '♡', '♢'] : ['♤', '♧', '♡'];
    const groupLabel = Utils.cardNumberToLabel(cardNumber);
    const memo = document.getElementById('memo-input').value.trim();

    const map = {};
    summariesCache.forEach(s => { map[s.suit] = s; });

    if (format === 'markdown') {
      let md = `## グループ ${groupLabel} 共有まとめ\n\n`;
      suits.forEach(s => {
        const text = map[s]?.summary_text || '（発表待ち）';
        md += `### ${s} ${Utils.suitToName(s)}チーム\n${text}\n\n`;
      });
      if (memo) {
        md += `---\n\n**共有メモ**\n${memo}\n`;
      }
      return md;
    } else {
      let text = `グループ ${groupLabel} 共有まとめ\n\n`;
      suits.forEach(s => {
        const body = map[s]?.summary_text || '（発表待ち）';
        text += `【${s} ${Utils.suitToName(s)}チーム】\n${body}\n\n`;
      });
      if (memo) {
        text += `【共有メモ】\n${memo}\n`;
      }
      return text;
    }
  }

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(buildContent('markdown'));
      Utils.showSuccess('Markdown形式でコピーしました');
    } catch {
      Utils.showError('コピーに失敗しました（ブラウザの許可が必要です）');
    }
  }

  async function copyPlainText() {
    try {
      await navigator.clipboard.writeText(buildContent('plain'));
      Utils.showSuccess('テキスト形式でコピーしました');
    } catch {
      Utils.showError('コピーに失敗しました（ブラウザの許可が必要です）');
    }
  }

})();
