// =============================================
// エキスパート活動ページ ロジック
// =============================================
(function () {
  let timerInterval = null;
  let remainingSeconds = 0;
  let chatMessages = []; // AI説明練習の会話履歴
  let sessionData = null;
  let lessonData = null;
  let isReadonly = false;

  // =============================================
  // 初期化
  // =============================================
  document.addEventListener('DOMContentLoaded', async () => {
    // セッションチェック
    if (!Utils.hasValidSession()) {
      window.location.href = '../index.html';
      return;
    }

    isReadonly = sessionStorage.getItem(Utils.SESSION_KEYS.READONLY) === 'true';
    lessonData = Utils.getLessonData();

    if (!lessonData) {
      window.location.href = '../index.html';
      return;
    }

    Utils.setLoading(true);
    try {
      const sessionId = sessionStorage.getItem(Utils.SESSION_KEYS.SESSION_ID);
      sessionData = await DB.getStudentSessionById(sessionId);

      renderPage();
      if (!isReadonly) {
        startTimer();
        setupNextButton();
      }
      setupAIButtons();
      setupModalHandlers();

    } catch (err) {
      Utils.showError('データの読み込みに失敗しました: ' + err.message);
    } finally {
      Utils.setLoading(false);
    }
  });

  // =============================================
  // ページ描画
  // =============================================
  function renderPage() {
    const suit = sessionStorage.getItem(Utils.SESSION_KEYS.SUIT);
    const cardNum = sessionStorage.getItem(Utils.SESSION_KEYS.CARD_NUMBER);
    const lesson = lessonData.lesson;
    const materials = lessonData.materials;

    // トランプバッジ
    const badge = document.getElementById('trump-badge');
    badge.textContent = `${suit} ${Utils.cardNumberToLabel(cardNum)}`;
    badge.style.color = Utils.suitToColor(suit);

    // 読み取り専用バナー
    if (isReadonly) {
      document.getElementById('readonly-banner').classList.remove('hidden');
      document.getElementById('timer-section').classList.add('hidden');
    }

    // 担当資料
    const suitLabel = document.getElementById('material-suit-label');
    suitLabel.textContent = `${suit} 【${Utils.suitToName(suit)}チーム】`;
    suitLabel.style.color = Utils.suitToColor(suit);

    const materialEl = document.getElementById('material-content');
    const content = materials[suit] || '';
    materialEl.style.borderLeftColor = Utils.suitToColor(suit);
    materialEl.textContent = content;

    // 既存の要約を表示
    const summaryInput = document.getElementById('summary-input');
    if (sessionData?.summary_text) {
      summaryInput.value = sessionData.summary_text;
      updateCharCount();
      updateNextButton();
    }

    if (isReadonly) {
      summaryInput.disabled = true;
    }

    // 文字数カウンター
    summaryInput.addEventListener('input', () => {
      updateCharCount();
      updateNextButton();
    });
  }

  function updateCharCount() {
    const text = document.getElementById('summary-input').value;
    document.getElementById('summary-char-count').textContent = text.length;
  }

  // =============================================
  // タイマー
  // =============================================
  function startTimer() {
    const minutes = lessonData.lesson.expert_timer_minutes || 15;
    remainingSeconds = minutes * 60;
    updateTimerDisplay();

    timerInterval = setInterval(() => {
      remainingSeconds--;
      if (remainingSeconds <= 0) {
        remainingSeconds = 0;
        clearInterval(timerInterval);
      }
      updateTimerDisplay();
    }, 1000);
  }

  function updateTimerDisplay() {
    const m = Math.floor(remainingSeconds / 60);
    const s = remainingSeconds % 60;
    const display = document.getElementById('timer-display');
    display.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    display.classList.remove('warning', 'danger');
    if (remainingSeconds <= 60) {
      display.classList.add('danger');
    } else if (remainingSeconds <= 180) {
      display.classList.add('warning');
    }
  }

  // =============================================
  // 次へボタン
  // =============================================
  function setupNextButton() {
    document.getElementById('btn-next').addEventListener('click', async () => {
      const summaryText = document.getElementById('summary-input').value.trim();
      if (!summaryText) {
        Utils.showError('要約を入力してください');
        return;
      }

      const btn = document.getElementById('btn-next');
      const warning = document.getElementById('copy-check-warning');
      warning.classList.add('hidden');

      // コピペチェック
      btn.disabled = true;
      btn.textContent = '確認中...';

      try {
        const suit = sessionStorage.getItem(Utils.SESSION_KEYS.SUIT);
        const materialContent = lessonData.materials[suit] || '';
        const result = await ClaudeAPI.checkCopyPaste(summaryText, materialContent);

        if (result.copied) {
          warning.classList.remove('hidden');
          document.getElementById('copy-check-feedback').textContent = result.feedback;
          btn.disabled = false;
          btn.textContent = '共有活動へ →';
          warning.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
      } catch (err) {
        // チェック失敗時は通過させる
        console.warn('コピペチェックエラー:', err.message);
      }

      // 通常送信処理
      btn.textContent = '送信中...';
      Utils.setLoading(true);
      try {
        const sessionId = sessionStorage.getItem(Utils.SESSION_KEYS.SESSION_ID);
        await DB.submitSummary(sessionId, summaryText);
        if (timerInterval) clearInterval(timerInterval);
        window.location.href = 'sharing.html';
      } catch (err) {
        Utils.showError('保存に失敗しました: ' + err.message);
        btn.disabled = false;
        btn.textContent = '共有活動へ →';
      } finally {
        Utils.setLoading(false);
      }
    });
  }

  function updateNextButton() {
    const text = document.getElementById('summary-input').value.trim();
    const btn = document.getElementById('btn-next');
    const hint = document.getElementById('next-hint');
    btn.disabled = !text;
    hint.textContent = text ? '' : '要約を入力してください';
  }

  // =============================================
  // AIボタン
  // =============================================
  function setupAIButtons() {
    document.getElementById('btn-ai-feedback').addEventListener('click', async () => {
      const summaryText = document.getElementById('summary-input').value.trim();
      if (!summaryText) {
        Utils.showError('先に要約を入力してください');
        return;
      }

      showModal('modal-feedback');
      document.getElementById('feedback-content').textContent = 'AIが考え中です...';

      try {
        const suit = sessionStorage.getItem(Utils.SESSION_KEYS.SUIT);
        const materialContent = lessonData.materials[suit] || '';
        const feedback = await ClaudeAPI.getSummaryFeedback(summaryText, materialContent);
        document.getElementById('feedback-content').textContent = feedback;

        // 履歴保存
        const sessionId = sessionStorage.getItem(Utils.SESSION_KEYS.SESSION_ID);
        await DB.saveAiInteraction(sessionId, 'summary_feedback', [
          { role: 'user', content: summaryText },
          { role: 'assistant', content: feedback },
        ]);
      } catch (err) {
        document.getElementById('feedback-content').textContent = 'エラーが発生しました: ' + err.message;
      }
    });

    document.getElementById('btn-ai-explain').addEventListener('click', async () => {
      const summaryText = document.getElementById('summary-input').value.trim();
      if (!summaryText) {
        Utils.showError('先に要約を入力してください');
        return;
      }

      showModal('modal-explain');
      chatMessages = [];
      document.getElementById('chat-messages').innerHTML = '';

      // AIが最初の質問を投げかける
      appendChatMessage('assistant', '（考え中...）');
      try {
        const suit = sessionStorage.getItem(Utils.SESSION_KEYS.SUIT);
        const materialContent = lessonData.materials[suit] || '';
        const firstQuestion = await ClaudeAPI.startExplanationPractice(summaryText, materialContent);

        // 最後のメッセージを置き換え
        const msgs = document.querySelectorAll('.chat-message');
        if (msgs.length > 0) msgs[msgs.length - 1].remove();

        appendChatMessage('assistant', firstQuestion);
        chatMessages.push({ role: 'user', content: `説明してほしいこと：${summaryText}` });
        chatMessages.push({ role: 'assistant', content: firstQuestion });

      } catch (err) {
        const msgs = document.querySelectorAll('.chat-message');
        if (msgs.length > 0) msgs[msgs.length - 1].remove();
        appendChatMessage('assistant', 'エラーが発生しました: ' + err.message);
      }
    });

    // チャット送信
    document.getElementById('btn-chat-send').addEventListener('click', sendChatMessage);
    document.getElementById('chat-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
  }

  async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    appendChatMessage('user', text);
    chatMessages.push({ role: 'user', content: text });

    const thinkingEl = appendChatMessage('assistant', '（考え中...）');
    document.getElementById('btn-chat-send').disabled = true;

    try {
      const reply = await ClaudeAPI.continueExplanation(chatMessages);
      thinkingEl.querySelector('.chat-bubble').textContent = reply;
      chatMessages.push({ role: 'assistant', content: reply });
    } catch (err) {
      thinkingEl.querySelector('.chat-bubble').textContent = 'エラー: ' + err.message;
    } finally {
      document.getElementById('btn-chat-send').disabled = false;
      input.focus();
    }
  }

  function appendChatMessage(role, content) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `chat-message ${role}`;
    div.innerHTML = `
      <div class="chat-role">${role === 'user' ? 'あなた' : 'AI（生徒役）'}</div>
      <div class="chat-bubble">${Utils._escapeHtml ? Utils._escapeHtml(content) : content}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
  }

  // =============================================
  // モーダル
  // =============================================
  function setupModalHandlers() {
    // ホームグループへ戻るボタン
    document.getElementById('btn-to-sharing').addEventListener('click', () => {
      const suit = sessionStorage.getItem(Utils.SESSION_KEYS.SUIT);
      const cardNumber = sessionStorage.getItem(Utils.SESSION_KEYS.CARD_NUMBER);
      const params = new URLSearchParams({ suit, group: cardNumber });
      window.location.href = `sharing.html?${params.toString()}`;
    });

    // 汎用クローズボタン
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.close;
        hideModal(id);
      });
    });

    // 説明練習クローズ（履歴保存）
    document.getElementById('close-explain').addEventListener('click', () => {
      saveExplanationAndClose();
    });
    document.getElementById('btn-close-explain').addEventListener('click', () => {
      saveExplanationAndClose();
    });
  }

  async function saveExplanationAndClose() {
    if (chatMessages.length > 0) {
      try {
        const sessionId = sessionStorage.getItem(Utils.SESSION_KEYS.SESSION_ID);
        await DB.saveAiInteraction(sessionId, 'explanation', chatMessages);
      } catch (e) {
        // 保存失敗は無視（エラー表示しない）
      }
    }
    hideModal('modal-explain');
  }

  function showModal(id) {
    document.getElementById(id).classList.remove('hidden');
  }

  function hideModal(id) {
    document.getElementById(id).classList.add('hidden');
  }

})();
