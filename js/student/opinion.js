// =============================================
// Opinionシートページ ロジック
// =============================================
(function () {
  let selectedPosition = null;
  let selectedTerms = [];
  let lessonData = null;
  let sessionData = null;
  let isReadonly = false;

  // =============================================
  // 初期化
  // =============================================
  document.addEventListener('DOMContentLoaded', async () => {
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
      setupEventListeners();
      setupSharingPanel();
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

    // ヘッダー
    const badge = document.getElementById('trump-badge');
    badge.textContent = `${suit} ${Utils.cardNumberToLabel(cardNum)}`;
    badge.style.color = Utils.suitToColor(suit);

    // 読み取り専用
    if (isReadonly) {
      document.getElementById('readonly-banner').classList.remove('hidden');
    }

    // 中心発問
    document.getElementById('central-question').textContent = lesson.central_question;

    // ルーブリック基準
    document.getElementById('rubric-logic-criteria').textContent = lesson.rubric_logic_criteria;
    document.getElementById('rubric-source-criteria').textContent = lesson.rubric_source_criteria;

    // 立場選択エリア
    renderPositionArea(lesson);

    // 指定語句
    renderTermsArea(lesson.required_terms || []);

    // 既存データがある場合は反映
    if (sessionData) {
      if (sessionData.position_choice) {
        setPosition(sessionData.position_choice);
      }
      if (sessionData.required_terms_used?.length > 0) {
        selectedTerms = sessionData.required_terms_used;
        // チェックボックスに反映
        selectedTerms.forEach(term => {
          const cb = document.querySelector(`input[data-term="${term}"]`);
          if (cb) cb.checked = true;
        });
      }
      if (sessionData.opinion_text) {
        document.getElementById('opinion-input').value = sessionData.opinion_text;
        updateOpinionPreview();
        updateCharCount();
      }
      if (sessionData.rubric_logic_score) {
        document.getElementById('rubric-logic').value = sessionData.rubric_logic_score;
      }
      if (sessionData.rubric_source_score) {
        document.getElementById('rubric-source').value = sessionData.rubric_source_score;
      }
    }

    // 読み取り専用の場合はフォームを無効化
    if (isReadonly) {
      disableAllInputs();
    }

    updateSubmitButton();
  }

  // =============================================
  // 立場選択エリア描画
  // =============================================
  function renderPositionArea(lesson) {
    const area = document.getElementById('position-area');

    if (lesson.position_type === 'free') {
      area.innerHTML = `
        <div class="position-buttons free">
          <input type="text" id="position-free-input" class="form-input"
            placeholder="自分の立場を自由に記述してください"
            style="font-size: 17px; padding: 14px;" />
        </div>
      `;
      const freeInput = document.getElementById('position-free-input');
      freeInput.addEventListener('input', () => {
        selectedPosition = freeInput.value.trim() || null;
        updateSubmitButton();
      });
      if (isReadonly) freeInput.disabled = true;
      return;
    }

    const positions = [
      { key: 'A', label: lesson.position_a_label || 'A' },
      { key: 'B', label: lesson.position_b_label || 'B' },
    ];
    if (lesson.position_type === 'ternary') {
      positions.push({ key: 'C', label: lesson.position_c_label || 'C' });
    }

    const typeClass = lesson.position_type === 'ternary' ? 'ternary' : 'binary';
    const buttonsHtml = positions.map(p => `
      <button class="position-btn" data-position="${p.key}" ${isReadonly ? 'disabled' : ''}>
        <div style="font-size: 22px; margin-bottom: 4px;">${p.key}</div>
        <div style="font-size: 15px; font-weight: 400;">${p.label}</div>
      </button>
    `).join('');

    area.innerHTML = `<div class="position-buttons ${typeClass}">${buttonsHtml}</div>`;

    if (!isReadonly) {
      area.querySelectorAll('.position-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          setPosition(btn.dataset.position);
        });
      });
    }
  }

  function setPosition(key) {
    selectedPosition = key;
    document.querySelectorAll('.position-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.position === key);
    });
    // 自由記述の場合
    const freeInput = document.getElementById('position-free-input');
    if (freeInput) {
      freeInput.value = key;
      selectedPosition = key;
    }
    updateSubmitButton();
  }

  // =============================================
  // 指定語句エリア描画
  // =============================================
  function renderTermsArea(terms) {
    const section = document.getElementById('terms-section');
    const grid = document.getElementById('terms-grid');

    if (!terms || terms.length === 0) {
      section.classList.add('hidden');
      return;
    }

    grid.innerHTML = terms.map((term, i) => `
      <div>
        <input type="checkbox" class="term-checkbox" id="term-${i}"
          data-term="${term}" ${isReadonly ? 'disabled' : ''}>
        <label class="term-label" for="term-${i}">${term}</label>
      </div>
    `).join('');

    if (!isReadonly) {
      grid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
          updateSelectedTerms();
          updateOpinionPreview();
        });
      });
    }
  }

  function updateSelectedTerms() {
    selectedTerms = [];
    document.querySelectorAll('.term-checkbox:checked').forEach(cb => {
      selectedTerms.push(cb.dataset.term);
    });
  }

  // =============================================
  // 意見文プレビュー更新
  // =============================================
  function updateOpinionPreview() {
    const text = document.getElementById('opinion-input').value;
    const previewWrap = document.getElementById('opinion-preview-wrap');
    const preview = document.getElementById('opinion-preview');

    if (text.trim()) {
      previewWrap.classList.remove('hidden');
      preview.innerHTML = Utils.highlightTerms(text, selectedTerms);
    } else {
      previewWrap.classList.add('hidden');
    }
  }

  function updateCharCount() {
    const text = document.getElementById('opinion-input').value;
    document.getElementById('opinion-char-count').textContent = text.length;
  }

  // =============================================
  // 提出ボタン
  // =============================================
  function updateSubmitButton() {
    const opinionText = document.getElementById('opinion-input')?.value?.trim() || '';
    const btn = document.getElementById('btn-submit-opinion');
    const hint = document.getElementById('submit-hint');

    const valid = selectedPosition && opinionText;
    btn.disabled = !valid || isReadonly;

    if (!selectedPosition) {
      hint.textContent = '立場を選んでください';
    } else if (!opinionText) {
      hint.textContent = '意見文を入力してください';
    } else {
      hint.textContent = '';
    }
  }

  // =============================================
  // イベントリスナー
  // =============================================
  function setupEventListeners() {
    // 意見文入力
    const opinionInput = document.getElementById('opinion-input');
    opinionInput.addEventListener('input', () => {
      updateOpinionPreview();
      updateCharCount();
      updateSubmitButton();
    });

    // AIフィードバック
    document.getElementById('btn-ai-opinion').addEventListener('click', async () => {
      const opinionText = document.getElementById('opinion-input').value.trim();
      if (!selectedPosition || !opinionText) {
        Utils.showError('立場と意見文を入力してからAIフィードバックを使ってください');
        return;
      }

      showModal('modal-opinion-feedback');
      document.getElementById('opinion-feedback-content').textContent = 'AIが考え中です...';

      try {
        const lesson = lessonData.lesson;
        const feedback = await ClaudeAPI.getOpinionFeedback({
          opinionText,
          positionChoice: selectedPosition,
          centralQuestion: lesson.central_question,
          requiredTerms: lesson.required_terms || [],
          rubricLogicCriteria: lesson.rubric_logic_criteria,
          rubricSourceCriteria: lesson.rubric_source_criteria,
          usedTerms: selectedTerms,
        });
        document.getElementById('opinion-feedback-content').textContent = feedback;

        // 履歴保存
        const sessionId = sessionStorage.getItem(Utils.SESSION_KEYS.SESSION_ID);
        await DB.saveAiInteraction(sessionId, 'opinion_feedback', [
          { role: 'user', content: opinionText },
          { role: 'assistant', content: feedback },
        ]);
      } catch (err) {
        document.getElementById('opinion-feedback-content').textContent = 'エラー: ' + err.message;
      }
    });

    // モーダルクローズ
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => hideModal(btn.dataset.close));
    });

    // 提出
    document.getElementById('btn-submit-opinion').addEventListener('click', handleSubmit);
  }

  async function handleSubmit() {
    const opinionText = document.getElementById('opinion-input').value.trim();
    if (!selectedPosition || !opinionText) {
      Utils.showError('立場と意見文を入力してください');
      return;
    }

    const rubricLogic = document.getElementById('rubric-logic').value;
    const rubricSource = document.getElementById('rubric-source').value;

    updateSelectedTerms();

    Utils.setLoading(true);
    try {
      const sessionId = sessionStorage.getItem(Utils.SESSION_KEYS.SESSION_ID);
      await DB.submitOpinion(sessionId, {
        positionChoice: selectedPosition,
        requiredTermsUsed: selectedTerms,
        opinionText,
        rubricLogicScore: rubricLogic || null,
        rubricSourceScore: rubricSource || null,
      });
      window.location.href = 'exchange.html';
    } catch (err) {
      Utils.showError('提出に失敗しました: ' + err.message);
    } finally {
      Utils.setLoading(false);
    }
  }

  function disableAllInputs() {
    document.querySelectorAll('input, textarea, select, button:not(.modal-close)').forEach(el => {
      el.disabled = true;
    });
    document.getElementById('btn-submit-opinion').disabled = true;
  }

  function showModal(id) { document.getElementById(id).classList.remove('hidden'); }
  function hideModal(id) { document.getElementById(id).classList.add('hidden'); }

  // =============================================
  // 共有活動パネル
  // =============================================
  function setupSharingPanel() {
    const SUITS_ALL = ['♤', '♧', '♡', '♢'];
    const suit = sessionStorage.getItem(Utils.SESSION_KEYS.SUIT);
    const cardNumber = parseInt(sessionStorage.getItem(Utils.SESSION_KEYS.CARD_NUMBER));
    const lessonSessionId = sessionStorage.getItem(Utils.SESSION_KEYS.LESSON_SESSION_ID);
    const suitCount = lessonData?.lesson?.suit_count || 3;
    const suits = suitCount === 4 ? SUITS_ALL : SUITS_ALL.slice(0, 3);

    let isPublic = false;
    let activeSuit = suit;
    let panelOpened = false;

    const toggleBtn = document.getElementById('sharing-panel-toggle');
    const panelBody = document.getElementById('sharing-panel-body');
    const toggleIcon = document.getElementById('sharing-toggle-icon');

    toggleBtn.addEventListener('click', async () => {
      const isHidden = panelBody.classList.contains('hidden');
      panelBody.classList.toggle('hidden', !isHidden);
      if (toggleIcon) toggleIcon.textContent = isHidden ? '▲' : '▼';

      if (isHidden && !panelOpened) {
        panelOpened = true;
        try {
          const status = await DB.getLessonSessionStatus(lessonSessionId);
          isPublic = status.sharing_public || false;
        } catch (e) {}
        renderSuitFilters();
        await loadAndRenderPosts();
      }
    });

    function renderSuitFilters() {
      const filterArea = document.getElementById('sharing-suit-filter');
      filterArea.innerHTML = suits.map(s => `
        <button class="sp-filter-btn ${s === activeSuit ? 'active' : ''}" data-suit="${s}"
          style="color: ${Utils.suitToColor(s)};">
          ${s} ${Utils.suitToName(s)}
        </button>
      `).join('');

      filterArea.querySelectorAll('.sp-filter-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          activeSuit = btn.dataset.suit;
          filterArea.querySelectorAll('.sp-filter-btn').forEach(b => {
            b.classList.toggle('active', b === btn);
          });
          await loadAndRenderPosts();
        });
      });
    }

    async function loadAndRenderPosts() {
      const list = document.getElementById('sharing-posts-list');
      list.innerHTML = '<p style="font-size:13px; color:var(--color-text-muted);">読み込み中...</p>';
      try {
        const posts = await DB.getSharingPosts(lessonSessionId, cardNumber, isPublic, activeSuit);
        if (posts.length === 0) {
          list.innerHTML = '<p style="font-size:13px; color:var(--color-text-muted);">投稿がありません</p>';
          return;
        }
        const typeLabel = { question: '質問', note: 'メモ追記', expert_reply: 'エキスパート回答' };
        const typeClass = { question: 'type-question', note: 'type-note', expert_reply: 'type-expert' };
        list.innerHTML = posts.map(p => {
          const groupInfo = isPublic
            ? `グループ${Utils.cardNumberToLabel(p.card_number)} / ${Utils.suitToName(p.suit)}`
            : Utils.suitToName(p.suit);
          return `
            <div class="sp-post-item">
              <div class="sp-post-header">
                <span class="post-type-badge ${typeClass[p.post_type] || ''}">${typeLabel[p.post_type] || p.post_type}</span>
                <span class="sp-post-meta">${groupInfo} · ${Utils.formatTime(p.created_at)}</span>
              </div>
              <div class="sp-post-content">${Utils._escapeHtml(p.content)}</div>
            </div>
          `;
        }).join('');
      } catch (err) {
        list.innerHTML = '<p style="font-size:13px; color:var(--color-text-muted);">読み込みエラー</p>';
      }
    }
  }

})();
