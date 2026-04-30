// =============================================
// 授業管理ページ ロジック
// =============================================
(function () {
  let currentLessonId = null;
  let currentSuitCount = 3;
  let passwords = [];
  let requiredTerms = [];
  let activeMaterialTab = '♤';

  // =============================================
  // 初期化
  // =============================================
  document.addEventListener('DOMContentLoaded', async () => {
    const ok = await TeacherAuth.checkAuth();
    if (!ok) return;

    document.getElementById('btn-logout').addEventListener('click', () => TeacherAuth.handleLogout());

    setupFormEventListeners();
    await loadLessons();
  });

  // =============================================
  // 授業一覧読み込み
  // =============================================
  async function loadLessons() {
    Utils.setLoading(true);
    try {
      const lessons = await DB.getLessons();
      renderLessonList(lessons);
    } catch (err) {
      Utils.showError('授業一覧の取得に失敗しました: ' + err.message);
    } finally {
      Utils.setLoading(false);
    }
  }

  function renderLessonList(lessons) {
    const container = document.getElementById('lesson-list');
    if (!lessons || lessons.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><p>授業がまだありません</p></div>';
      return;
    }

    const typeLabel = { binary: '二択', ternary: '三択', free: '自由' };
    container.innerHTML = lessons.map(l => `
      <div class="lesson-card ${currentLessonId === l.id ? 'selected' : ''}" data-id="${l.id}">
        <div class="lesson-card-info">
          <h3>${l.name}</h3>
          <div class="lesson-card-meta">
            ${l.suit_count}スート ／ ${typeLabel[l.position_type] || ''} ／ ${Utils.formatDate(l.created_at)}
          </div>
        </div>
        <div class="lesson-card-actions">
          <button class="btn btn-danger btn-sm btn-delete" data-id="${l.id}" data-name="${l.name}">削除</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.lesson-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-delete')) return;
        openEditForm(card.dataset.id);
      });
    });

    container.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteLesson(btn.dataset.id, btn.dataset.name);
      });
    });
  }

  // =============================================
  // フォームイベント設定
  // =============================================
  function setupFormEventListeners() {
    // 新規作成ボタン
    document.getElementById('btn-new-lesson').addEventListener('click', openCreateForm);

    // 保存
    document.getElementById('btn-save-lesson').addEventListener('click', saveLesson);

    // 削除（フォーム内）
    document.getElementById('btn-delete-lesson').addEventListener('click', () => {
      const name = document.getElementById('field-name').value;
      deleteLesson(currentLessonId, name);
    });

    // スート数切り替え
    document.querySelectorAll('input[name="suit-count"]').forEach(radio => {
      radio.addEventListener('change', () => {
        currentSuitCount = parseInt(radio.value);
        renderMaterialTabs(currentSuitCount);
        renderKeywordInputs(currentSuitCount, {});
      });
    });

    // 立場タイプ切り替え
    document.querySelectorAll('input[name="position-type"]').forEach(radio => {
      radio.addEventListener('change', () => {
        updatePositionLabelsUI(radio.value);
      });
    });

    // 余り処理切り替え
    document.querySelectorAll('input[name="remainder-type"]').forEach(radio => {
      radio.addEventListener('change', () => {
        document.getElementById('priority-suit-group').classList.toggle('hidden', radio.value !== 'priority_suit');
      });
    });

    // パスワードタグ入力
    setupTagInput('password-tag-input', 'passwords-area', passwords);

    // 語句タグ入力
    setupTagInput('term-tag-input', 'terms-area', requiredTerms);

    // 実施クラス追加
    document.getElementById('btn-add-session').addEventListener('click', async () => {
      document.getElementById('session-form').classList.remove('hidden');
      await loadYearsForSessionForm();
    });
    document.getElementById('btn-cancel-session').addEventListener('click', () => {
      document.getElementById('session-form').classList.add('hidden');
    });
    document.getElementById('field-session-year').addEventListener('change', async (e) => {
      await loadClassesForSessionForm(e.target.value);
    });
    document.getElementById('btn-save-session').addEventListener('click', addSession);

    // 今日の日付をデフォルト
    document.getElementById('field-session-date').value = new Date().toISOString().split('T')[0];
  }

  function updatePositionLabelsUI(type) {
    const binaryLabels = document.getElementById('binary-labels');
    const ternaryC = document.getElementById('ternary-c-label');
    binaryLabels.classList.toggle('hidden', type === 'free');
    ternaryC.classList.toggle('hidden', type !== 'ternary');
  }

  // =============================================
  // タグ入力
  // =============================================
  function setupTagInput(inputId, areaId, tagsArray) {
    const input = document.getElementById(inputId);
    const area = document.getElementById(areaId);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const value = input.value.trim();
        if (value && !tagsArray.includes(value)) {
          tagsArray.push(value);
          renderTags(area, tagsArray, input);
        }
        input.value = '';
      }
    });
  }

  function renderTags(area, tagsArray, inputEl) {
    // タグ要素を全て削除
    area.querySelectorAll('.tag-item').forEach(el => el.remove());
    // タグを挿入（inputの前に）
    tagsArray.forEach((tag, i) => {
      const tagEl = document.createElement('span');
      tagEl.className = 'tag-item';
      tagEl.innerHTML = `${tag} <span class="tag-remove" data-index="${i}">×</span>`;
      area.insertBefore(tagEl, inputEl);
    });

    area.querySelectorAll('.tag-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        tagsArray.splice(parseInt(btn.dataset.index), 1);
        renderTags(area, tagsArray, inputEl);
      });
    });
  }

  // =============================================
  // 資料タブ描画
  // =============================================
  function renderMaterialTabs(suitCount) {
    const suits = suitCount === 4 ? ['♤', '♧', '♡', '♢'] : ['♤', '♧', '♡'];
    const tabsContainer = document.getElementById('material-tabs');
    const panelsContainer = document.getElementById('material-panels');

    tabsContainer.innerHTML = suits.map(s => `
      <button class="suit-tab ${s === activeMaterialTab ? 'active' : ''}"
        data-suit="${s}" style="color: ${Utils.suitToColor(s)};">${s}</button>
    `).join('');

    panelsContainer.innerHTML = suits.map(s => `
      <div class="tab-panel ${s === activeMaterialTab ? 'active' : ''}" data-panel="${s}">
        <textarea class="form-textarea material-textarea" id="material-${s}" rows="8"
          placeholder="${Utils.suitToName(s)}チーム（${s}）の資料テキストを入力..."></textarea>
      </div>
    `).join('');

    tabsContainer.querySelectorAll('.suit-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        activeMaterialTab = tab.dataset.suit;
        tabsContainer.querySelectorAll('.suit-tab').forEach(t => t.classList.toggle('active', t === tab));
        panelsContainer.querySelectorAll('.tab-panel').forEach(p => {
          p.classList.toggle('active', p.dataset.panel === activeMaterialTab);
        });
      });
    });
  }

  // =============================================
  // フォームを開く（新規）
  // =============================================
  function openCreateForm() {
    currentLessonId = null;
    passwords.length = 0;
    requiredTerms.length = 0;
    currentSuitCount = 3;

    document.getElementById('form-empty-state').classList.add('hidden');
    document.getElementById('lesson-form').classList.remove('hidden');
    document.getElementById('form-title').textContent = '新しい授業を作成';
    document.getElementById('btn-delete-lesson').classList.add('hidden');

    // フォームリセット
    document.getElementById('field-name').value = '';
    document.getElementById('field-central-question').value = '';
    document.getElementById('field-pos-a').value = '';
    document.getElementById('field-pos-b').value = '';
    document.getElementById('field-pos-c').value = '';
    document.getElementById('field-rubric-logic').value = '';
    document.getElementById('field-rubric-source').value = '';
    document.getElementById('field-timer').value = '15';
    document.getElementById('field-entry-message').value = '';
    document.getElementById('session-list-in-form').innerHTML = '<p class="text-muted" style="font-size: 13px;">まず授業を保存してから実施クラスを追加できます</p>';

    // ラジオをリセット
    document.querySelector('input[name="suit-count"][value="3"]').checked = true;
    document.querySelector('input[name="position-type"][value="binary"]').checked = true;
    document.querySelector('input[name="remainder-type"][value="joker"]').checked = true;

    updatePositionLabelsUI('binary');
    document.getElementById('priority-suit-group').classList.add('hidden');

    // タグをリセット
    renderTags(document.getElementById('passwords-area'), passwords, document.getElementById('password-tag-input'));
    renderTags(document.getElementById('terms-area'), requiredTerms, document.getElementById('term-tag-input'));

    renderMaterialTabs(3);
    renderKeywordInputs(3, {});

    // sharing-mode をリセット
    const sharingModeDefault = document.querySelector('input[name="sharing-mode"][value="full"]');
    if (sharingModeDefault) sharingModeDefault.checked = true;
  }

  // =============================================
  // フォームを開く（編集）
  // =============================================
  async function openEditForm(lessonId) {
    currentLessonId = lessonId;
    Utils.setLoading(true);

    try {
      const { lesson, materials, keywords } = await DB.getLesson(lessonId);

      document.getElementById('form-empty-state').classList.add('hidden');
      document.getElementById('lesson-form').classList.remove('hidden');
      document.getElementById('form-title').textContent = '授業を編集';
      document.getElementById('btn-delete-lesson').classList.remove('hidden');

      // フォームに値をセット
      document.getElementById('field-name').value = lesson.name || '';
      document.getElementById('field-central-question').value = lesson.central_question || '';
      document.getElementById('field-pos-a').value = lesson.position_a_label || '';
      document.getElementById('field-pos-b').value = lesson.position_b_label || '';
      document.getElementById('field-pos-c').value = lesson.position_c_label || '';
      document.getElementById('field-rubric-logic').value = lesson.rubric_logic_criteria || '';
      document.getElementById('field-rubric-source').value = lesson.rubric_source_criteria || '';
      document.getElementById('field-timer').value = lesson.expert_timer_minutes || 15;
      document.getElementById('field-entry-message').value = lesson.entry_message || '';

      // スート数
      currentSuitCount = lesson.suit_count;
      document.querySelector(`input[name="suit-count"][value="${lesson.suit_count}"]`).checked = true;

      // 立場タイプ
      document.querySelector(`input[name="position-type"][value="${lesson.position_type}"]`).checked = true;
      updatePositionLabelsUI(lesson.position_type);

      // 余り処理
      document.querySelector(`input[name="remainder-type"][value="${lesson.remainder_type}"]`).checked = true;
      document.getElementById('priority-suit-group').classList.toggle('hidden', lesson.remainder_type !== 'priority_suit');
      if (lesson.priority_suit) {
        document.getElementById('field-priority-suit').value = lesson.priority_suit;
      }

      // パスワードタグ
      passwords.length = 0;
      (lesson.passwords || []).forEach(p => passwords.push(p));
      renderTags(document.getElementById('passwords-area'), passwords, document.getElementById('password-tag-input'));

      // 語句タグ
      requiredTerms.length = 0;
      (lesson.required_terms || []).forEach(t => requiredTerms.push(t));
      renderTags(document.getElementById('terms-area'), requiredTerms, document.getElementById('term-tag-input'));

      // 資料タブ
      renderMaterialTabs(lesson.suit_count);
      ['♤', '♧', '♡', '♢'].forEach(suit => {
        const ta = document.getElementById(`material-${suit}`);
        if (ta && materials[suit]) ta.value = materials[suit];
      });

      // 共有活動設定
      const sharingMode = lesson.sharing_mode || 'full';
      const sharingModeRadio = document.querySelector(`input[name="sharing-mode"][value="${sharingMode}"]`);
      if (sharingModeRadio) sharingModeRadio.checked = true;
      renderKeywordInputs(lesson.suit_count, keywords || {});

      // 実施クラス一覧
      await loadSessionsForLesson(lessonId);

      // カードのハイライト
      document.querySelectorAll('.lesson-card').forEach(c => {
        c.classList.toggle('selected', c.dataset.id === lessonId);
      });

    } catch (err) {
      Utils.showError('授業データの読み込みに失敗しました: ' + err.message);
    } finally {
      Utils.setLoading(false);
    }
  }

  // =============================================
  // 授業保存
  // =============================================
  async function saveLesson() {
    const name = document.getElementById('field-name').value.trim();
    if (!name) {
      Utils.showError('授業名を入力してください');
      return;
    }
    const isNew = !currentLessonId;

    const suitCount = parseInt(document.querySelector('input[name="suit-count"]:checked').value);
    const positionType = document.querySelector('input[name="position-type"]:checked').value;
    const remainderType = document.querySelector('input[name="remainder-type"]:checked').value;
    const sharingMode = document.querySelector('input[name="sharing-mode"]:checked')?.value || 'full';

    // パスワードを正規化して保存
    const normalizedPasswords = passwords.map(p => Utils.normalizeString(p)).filter(Boolean);

    const lessonData = {
      name,
      passwords: normalizedPasswords,
      suit_count: suitCount,
      central_question: document.getElementById('field-central-question').value.trim(),
      position_type: positionType,
      position_a_label: document.getElementById('field-pos-a').value.trim() || 'A',
      position_b_label: document.getElementById('field-pos-b').value.trim() || 'B',
      position_c_label: document.getElementById('field-pos-c').value.trim() || 'C',
      required_terms: [...requiredTerms],
      rubric_logic_criteria: document.getElementById('field-rubric-logic').value.trim(),
      rubric_source_criteria: document.getElementById('field-rubric-source').value.trim(),
      expert_timer_minutes: parseInt(document.getElementById('field-timer').value) || 15,
      entry_message: document.getElementById('field-entry-message').value.trim(),
      sharing_mode: sharingMode,
      remainder_type: remainderType,
      priority_suit: remainderType === 'priority_suit' ? document.getElementById('field-priority-suit').value : null,
    };

    Utils.setLoading(true);
    try {
      let lesson;
      if (currentLessonId) {
        lesson = await DB.updateLesson(currentLessonId, lessonData);
      } else {
        lesson = await DB.createLesson(lessonData);
        currentLessonId = lesson.id;
      }

      // 資料を保存
      const suits = suitCount === 4 ? ['♤', '♧', '♡', '♢'] : ['♤', '♧', '♡'];
      for (const suit of suits) {
        const content = document.getElementById(`material-${suit}`)?.value || '';
        const kwInput = document.getElementById(`keywords-${suit}`);
        const kws = kwInput ? kwInput.value.split(',').map(k => k.trim()).filter(Boolean) : [];
        await DB.saveMaterial(currentLessonId, suit, content, kws);
      }

      Utils.showSuccess('授業を保存しました');
      document.getElementById('btn-delete-lesson').classList.remove('hidden');
      document.getElementById('form-title').textContent = '授業を編集';

      // 実施クラスセクションを表示
      await loadSessionsForLesson(currentLessonId);
      await loadLessons();

      if (isNew) {
        document.getElementById('new-lesson-banner').classList.remove('hidden');
        document.getElementById('sessions-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

    } catch (err) {
      Utils.showError('保存に失敗しました: ' + err.message);
    } finally {
      Utils.setLoading(false);
    }
  }

  // =============================================
  // 授業削除
  // =============================================
  async function deleteLesson(lessonId, lessonName) {
    if (!confirm(`「${lessonName}」を削除しますか？\n関連する実施記録・生徒データも全て削除されます。`)) return;
    Utils.setLoading(true);
    try {
      await DB.deleteLesson(lessonId);
      currentLessonId = null;
      document.getElementById('lesson-form').classList.add('hidden');
      document.getElementById('form-empty-state').classList.remove('hidden');
      Utils.showSuccess('削除しました');
      await loadLessons();
    } catch (err) {
      Utils.showError('削除に失敗しました: ' + err.message);
    } finally {
      Utils.setLoading(false);
    }
  }

  // =============================================
  // 実施クラス管理
  // =============================================
  async function loadSessionsForLesson(lessonId) {
    const container = document.getElementById('session-list-in-form');
    try {
      const sessions = await DB.getLessonSessions(lessonId);
      if (!sessions || sessions.length === 0) {
        container.innerHTML = '<p class="text-muted" style="font-size: 13px;">実施クラスが登録されていません</p>';
        return;
      }
      container.innerHTML = sessions.map(s => `
        <div class="session-row ${s.is_active ? 'active-session' : ''}">
          <div class="session-info">
            <div class="session-name">${s.is_active ? '🟢 ' : ''}${s.class_name}</div>
            <div class="session-meta">${Utils.formatDate(s.session_date)}</div>
          </div>
          <div class="session-actions">
            <button class="btn btn-danger btn-sm btn-del-session" data-id="${s.id}">削除</button>
          </div>
        </div>
      `).join('');

      container.querySelectorAll('.btn-del-session').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('このクラスの実施記録を削除しますか？')) return;
          Utils.setLoading(true);
          try {
            await DB.deleteLessonSession(btn.dataset.id);
            await loadSessionsForLesson(currentLessonId);
          } catch (err) {
            Utils.showError('削除に失敗しました: ' + err.message);
          } finally {
            Utils.setLoading(false);
          }
        });
      });
    } catch (err) {
      container.innerHTML = '<p class="text-muted">読み込みエラー</p>';
    }
  }

  async function loadYearsForSessionForm() {
    const select = document.getElementById('field-session-year');
    try {
      const years = await DB.getAcademicYears();
      select.innerHTML = '<option value="">選んでください</option>';
      years.forEach(y => {
        select.innerHTML += `<option value="${y.id}">${y.year_label}</option>`;
      });
    } catch (err) {
      Utils.showError('年度の読み込みに失敗しました');
    }
  }

  async function loadClassesForSessionForm(yearId) {
    const select = document.getElementById('field-session-class');
    if (!yearId) {
      select.innerHTML = '<option value="">年度を選んでください</option>';
      return;
    }
    try {
      const classes = await DB.getClasses(yearId);
      select.innerHTML = '<option value="">選んでください</option>';
      classes.forEach(c => {
        select.innerHTML += `<option value="${c.id}">${c.name}</option>`;
      });
    } catch (err) {
      Utils.showError('クラスの読み込みに失敗しました');
    }
  }

  // =============================================
  // キーワード入力欄描画
  // =============================================
  function renderKeywordInputs(suitCount, keywordsData) {
    const suits = suitCount === 4 ? ['♤', '♧', '♡', '♢'] : ['♤', '♧', '♡'];
    const area = document.getElementById('keyword-inputs-area');
    if (!area) return;
    area.innerHTML = suits.map(s => `
      <div class="form-group" style="margin-bottom: 8px;">
        <label class="form-label" style="color:${Utils.suitToColor(s)};">${s} ${Utils.suitToName(s)}</label>
        <input type="text" id="keywords-${s}" class="form-input"
          placeholder="例: 労働者,機械,工場"
          value="${Utils._escapeHtml((keywordsData?.[s] || []).join(', '))}">
      </div>
    `).join('');
  }

  async function addSession() {
    if (!currentLessonId) {
      Utils.showError('先に授業を保存してください');
      return;
    }
    const classId = document.getElementById('field-session-class').value;
    const date = document.getElementById('field-session-date').value;
    if (!classId) {
      Utils.showError('クラスを選んでください');
      return;
    }
    Utils.setLoading(true);
    try {
      await DB.createLessonSession(currentLessonId, classId, date);
      document.getElementById('session-form').classList.add('hidden');
      await loadSessionsForLesson(currentLessonId);
      Utils.showSuccess('実施クラスを追加しました');
    } catch (err) {
      Utils.showError('追加に失敗しました: ' + err.message);
    } finally {
      Utils.setLoading(false);
    }
  }

})();
