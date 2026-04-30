// =============================================
// ダッシュボード ロジック
// =============================================
(function () {
  let selectedSessionId = null;
  let selectedLessonName = '';
  let autoRefreshInterval = null;
  let exchangePhaseOn = false;
  let sharingPublicOn = false;
  let studentsData = [];
  let duplicateEntriesData = [];

  const REFRESH_INTERVAL_MS = 20000; // 20秒

  // =============================================
  // 初期化
  // =============================================
  document.addEventListener('DOMContentLoaded', async () => {
    const ok = await TeacherAuth.checkAuth();
    if (!ok) return;

    setupEventListeners();
    loadNoSessionWarning();
  });

  function setupEventListeners() {
    document.getElementById('btn-logout').addEventListener('click', () => TeacherAuth.handleLogout());
    document.getElementById('btn-refresh').addEventListener('click', () => {
      if (selectedSessionId) loadDashboardData();
    });
    document.getElementById('btn-load-sessions').addEventListener('click', loadSessionList);

    // 意見交換フェーズトグル
    document.getElementById('toggle-exchange').addEventListener('change', async (e) => {
      if (!selectedSessionId) return;
      const enabled = e.target.checked;
      Utils.setLoading(true);
      try {
        await DB.setExchangePhase(selectedSessionId, enabled);
        exchangePhaseOn = enabled;
        updateExchangeToggleUI(enabled);
        Utils.showSuccess(`意見交換フェーズを${enabled ? 'ON' : 'OFF'}にしました`);
      } catch (err) {
        e.target.checked = !enabled; // 元に戻す
        Utils.showError('切り替えに失敗しました: ' + err.message);
      } finally {
        Utils.setLoading(false);
      }
    });

    // 共有活動公開トグル
    document.getElementById('toggle-sharing-public').addEventListener('change', async (e) => {
      if (!selectedSessionId) return;
      const enabled = e.target.checked;
      Utils.setLoading(true);
      try {
        await DB.setSharingPublic(selectedSessionId, enabled);
        sharingPublicOn = enabled;
        updateSharingPublicUI(enabled);
        Utils.showSuccess(`共有活動公開を${enabled ? 'ON（全グループ公開）' : 'OFF（グループ内のみ）'}にしました`);
      } catch (err) {
        e.target.checked = !enabled;
        Utils.showError('切り替えに失敗しました: ' + err.message);
      } finally {
        Utils.setLoading(false);
      }
    });

    // CSVエクスポート
    document.getElementById('btn-export-csv').addEventListener('click', () => {
      if (!selectedSessionId) return;
      TeacherExport.exportCSV(selectedSessionId, selectedLessonName);
    });

    // 生徒詳細モーダルを閉じる
    document.getElementById('modal-close').addEventListener('click', () => {
      document.getElementById('student-detail-modal').classList.add('hidden');
    });
    document.getElementById('student-detail-modal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
    });

    // 重複入室バッジ
    document.getElementById('btn-duplicate-badge').addEventListener('click', showDuplicateModal);
    document.getElementById('duplicate-modal-close').addEventListener('click', () => {
      document.getElementById('duplicate-entries-modal').classList.add('hidden');
    });
    document.getElementById('btn-clear-duplicates').addEventListener('click', async () => {
      if (!selectedSessionId) return;
      if (!confirm('重複入室の記録をすべて削除しますか？')) return;
      try {
        await DB.clearDuplicateEntries(selectedSessionId);
        duplicateEntriesData = [];
        updateDuplicateBadge(0);
        document.getElementById('duplicate-entries-modal').classList.add('hidden');
        Utils.showSuccess('重複入室の記録をクリアしました');
      } catch (err) {
        Utils.showError('クリアに失敗しました: ' + err.message);
      }
    });
    document.getElementById('duplicate-entries-modal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
    });

    // AI対話ログ再読込
    document.getElementById('btn-reload-ai-log').addEventListener('click', () => {
      if (selectedSessionId) loadAiInteractions();
    });

    // 全授業終了
    document.getElementById('btn-deactivate-all').addEventListener('click', async () => {
      if (!confirm('実施中のすべての授業セッションを終了しますか？')) return;
      Utils.setLoading(true);
      try {
        await DB.deactivateAllSessions();
        Utils.showSuccess('全授業セッションを終了しました');
        loadSessionList();
      } catch (err) {
        Utils.showError('操作に失敗しました: ' + err.message);
      } finally {
        Utils.setLoading(false);
      }
    });
  }

  // =============================================
  // セッション一覧の読み込み
  // =============================================
  async function loadSessionList() {
    Utils.setLoading(true);
    try {
      const sessions = await DB.getAllLessonSessions();
      renderSessionList(sessions);
    } catch (err) {
      Utils.showError('セッション一覧の取得に失敗しました: ' + err.message);
    } finally {
      Utils.setLoading(false);
    }
  }

  function renderSessionList(sessions) {
    const container = document.getElementById('session-list');

    if (!sessions || sessions.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>授業セッションがまだありません。「授業管理」で作成してください。</p></div>';
      return;
    }

    container.innerHTML = sessions.map(s => {
      const toggleId = `toggle-sess-${s.id.slice(0, 8)}`;
      return `
        <div class="session-row ${s.is_active ? 'active-session' : ''}" data-session-id="${s.id}">
          <div class="session-info">
            <div class="session-name">
              ${s.is_active ? '🟢 ' : ''}${s.lesson_name} — ${s.class_name}
            </div>
            <div class="session-meta">${Utils.formatDate(s.session_date)} ${s.is_active ? '（アクティブ）' : ''}</div>
          </div>
          <div class="session-actions" style="align-items:center;">
            <div class="toggle-wrap" style="margin:0;" title="${s.is_active ? 'クリックで停止' : 'クリックでアクティブ化'}">
              <input type="checkbox" class="toggle-input toggle-is-active" id="${toggleId}"
                data-id="${s.id}" data-lesson="${Utils._escapeHtml(s.lesson_name)}" ${s.is_active ? 'checked' : ''}>
              <label class="toggle-track" for="${toggleId}">
                <span class="toggle-thumb"></span>
              </label>
            </div>
            <button class="btn btn-secondary btn-sm btn-reset-session" data-id="${s.id}">🔄 リセット</button>
            <button class="btn btn-primary btn-sm btn-select-session" data-id="${s.id}" data-lesson="${Utils._escapeHtml(s.lesson_name)}">
              モニタリング →
            </button>
          </div>
        </div>
      `;
    }).join('');

    // is_active トグル
    container.querySelectorAll('.toggle-is-active').forEach(toggle => {
      toggle.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        const id = toggle.dataset.id;
        const lesson = toggle.dataset.lesson;
        if (enabled) {
          if (!confirm(`「${lesson}」をアクティブにしますか？\n同一授業の他のセッションは停止されます。`)) {
            e.target.checked = false;
            return;
          }
          Utils.setLoading(true);
          try {
            await DB.setActiveSession(id);
            Utils.showSuccess('アクティブにしました');
            loadSessionList();
          } catch (err) {
            e.target.checked = false;
            Utils.showError('切り替えに失敗しました: ' + err.message);
          } finally {
            Utils.setLoading(false);
          }
        } else {
          if (!confirm('このセッションを停止しますか？')) {
            e.target.checked = true;
            return;
          }
          Utils.setLoading(true);
          try {
            await DB.deactivateSession(id);
            Utils.showSuccess('停止しました');
            loadSessionList();
          } catch (err) {
            e.target.checked = true;
            Utils.showError('停止に失敗しました: ' + err.message);
          } finally {
            Utils.setLoading(false);
          }
        }
      });
    });

    // リセットボタン
    container.querySelectorAll('.btn-reset-session').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('このセッションの生徒データをすべてリセットしますか？\n（要約・意見がクリアされます。元に戻せません。）')) return;
        Utils.setLoading(true);
        try {
          await DB.resetStudentSessionData(btn.dataset.id);
          Utils.showSuccess('生徒データをリセットしました');
          if (selectedSessionId === btn.dataset.id) loadDashboardData();
        } catch (err) {
          Utils.showError('リセットに失敗しました: ' + err.message);
        } finally {
          Utils.setLoading(false);
        }
      });
    });

    // モニタリング選択ボタン
    container.querySelectorAll('.btn-select-session').forEach(btn => {
      btn.addEventListener('click', () => {
        selectSession(btn.dataset.id, btn.dataset.lesson);
      });
    });
  }

  // =============================================
  // セッション選択 → ダッシュボード表示
  // =============================================
  async function selectSession(sessionId, lessonName) {
    selectedSessionId = sessionId;
    selectedLessonName = lessonName;

    document.getElementById('dashboard-body').classList.remove('hidden');

    // 自動更新
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    await loadDashboardData();
    autoRefreshInterval = setInterval(loadDashboardData, REFRESH_INTERVAL_MS);

    // AI対話ログは初回のみ読み込む（重い処理のため自動更新対象外）
    loadAiInteractions();
  }

  // =============================================
  // ダッシュボードデータ読み込み & 描画
  // =============================================
  async function loadDashboardData() {
    if (!selectedSessionId) return;

    try {
      // セッションステータス・ダッシュボードデータ・重複入室を並行取得
      const [status, dashData, duplicateEntries] = await Promise.all([
        DB.getLessonSessionStatus(selectedSessionId),
        DB.getDashboardData(selectedSessionId),
        DB.getDuplicateEntries(selectedSessionId),
      ]);

      // 意見交換フェーズ状態を反映
      exchangePhaseOn = status.exchange_phase_on;
      document.getElementById('toggle-exchange').checked = exchangePhaseOn;
      updateExchangeToggleUI(exchangePhaseOn);

      // 共有活動公開状態を反映
      sharingPublicOn = status.sharing_public || false;
      document.getElementById('toggle-sharing-public').checked = sharingPublicOn;
      updateSharingPublicUI(sharingPublicOn);

      // 統計
      renderStats(dashData);

      // 提出状況テーブル
      renderStudentTable(dashData.students);

      // 語句ランキング
      renderTermsRanking(dashData.termUsageCounts);

      // 立場分布グラフ
      renderPositionChart(dashData.positionStats);

      // 重複入室バッジ
      duplicateEntriesData = duplicateEntries;
      updateDuplicateBadge(duplicateEntries.length);

      // 最終更新時刻
      document.getElementById('last-updated').textContent = `最終更新: ${Utils.nowTimeStr()}`;

    } catch (err) {
      console.warn('Dashboard update error:', err.message);
    }
  }

  // =============================================
  // 各UI描画関数
  // =============================================
  function renderStats(data) {
    document.getElementById('stat-total').textContent = data.totalStudents;
    document.getElementById('stat-summary').textContent = data.summarySubmitted;
    document.getElementById('stat-opinion').textContent = data.opinionSubmitted;

    const total = data.totalStudents || 1;
    document.getElementById('stat-summary-pct').textContent =
      `${Math.round(data.summarySubmitted / total * 100)}%`;
    document.getElementById('stat-opinion-pct').textContent =
      `${Math.round(data.opinionSubmitted / total * 100)}%`;
  }

  function renderStudentTable(students) {
    const tbody = document.getElementById('student-table-body');
    if (!students || students.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">参加者なし</td></tr>';
      return;
    }

    studentsData = students;
    tbody.innerHTML = students.map((s, i) => {
      const suitColor = Utils.suitToColor(s.suit);
      const summaryOk = s.summary_submitted_at;
      const opinionOk = s.opinion_submitted_at;
      return `
        <tr class="clickable-row" data-index="${i}" title="クリックで詳細を表示">
          <td class="suit-cell" style="color: ${suitColor};">${s.suit}${s.is_joker ? ' 🃏' : ''}</td>
          <td>${Utils.cardNumberToLabel(s.card_number)}</td>
          <td class="check-cell">${summaryOk ? '<span style="color:var(--color-success);">✓</span>' : '<span style="color:var(--color-border);">—</span>'}</td>
          <td class="check-cell">${opinionOk ? '<span style="color:var(--color-success);">✓</span>' : '<span style="color:var(--color-border);">—</span>'}</td>
          <td>${s.position_choice ? Utils._escapeHtml(s.position_choice) : '<span class="text-muted">—</span>'}</td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.clickable-row').forEach(row => {
      row.addEventListener('click', () => {
        showStudentDetail(studentsData[parseInt(row.dataset.index)]);
      });
    });
  }

  function showStudentDetail(student) {
    const modal = document.getElementById('student-detail-modal');
    document.getElementById('modal-title').textContent =
      `${student.suit}${student.is_joker ? ' 🃏' : ''} ${Utils.cardNumberToLabel(student.card_number)} の提出内容`;
    document.getElementById('modal-position').textContent =
      student.position_choice || '（未回答）';
    document.getElementById('modal-terms').textContent =
      student.required_terms_used?.length ? student.required_terms_used.join('、') : '（なし）';
    document.getElementById('modal-summary').textContent =
      student.summary_text || '（未提出）';
    document.getElementById('modal-opinion').textContent =
      student.opinion_text || '（未提出）';
    modal.classList.remove('hidden');
  }

  function renderTermsRanking(termCounts) {
    const container = document.getElementById('terms-ranking');
    const entries = Object.entries(termCounts).sort((a, b) => b[1] - a[1]);

    if (entries.length === 0) {
      container.innerHTML = '<span class="text-muted" style="font-size: 13px;">提出待ち...</span>';
      return;
    }

    container.innerHTML = entries.map(([term, count]) => `
      <span class="term-tag">
        ${Utils._escapeHtml(String(term))}
        <span class="term-count">${parseInt(count) || 0}</span>
      </span>
    `).join('');
  }

  function renderPositionChart(positionStats) {
    const chart = document.getElementById('mini-bar-chart');
    const entries = Object.entries(positionStats);

    if (entries.length === 0) {
      chart.innerHTML = '<span class="text-muted" style="font-size: 13px;">提出待ち...</span>';
      return;
    }

    const maxCount = Math.max(...entries.map(([, v]) => v), 1);
    const maxHeight = 50; // px

    chart.innerHTML = entries.map(([key, count]) => {
      const height = Math.round((count / maxCount) * maxHeight);
      return `
        <div class="mini-bar-group">
          <div class="mini-bar-count">${count}</div>
          <div class="mini-bar" style="height: ${height}px;"></div>
          <div class="mini-bar-label">${Utils._escapeHtml(String(key))}</div>
        </div>
      `;
    }).join('');
  }

  function updateExchangeToggleUI(enabled) {
    const label = document.getElementById('exchange-status-label');
    label.textContent = enabled ? 'ON（開催中）' : 'OFF';
    label.style.color = enabled ? 'var(--color-success)' : 'var(--color-text-muted)';
  }

  function updateSharingPublicUI(enabled) {
    const label = document.getElementById('sharing-public-status-label');
    label.textContent = enabled ? 'ON（全グループ公開）' : 'OFF（グループ内のみ）';
    label.style.color = enabled ? 'var(--color-success)' : 'var(--color-text-muted)';
  }

  // =============================================
  // 重複入室バッジ・モーダル
  // =============================================
  function updateDuplicateBadge(count) {
    const badge = document.getElementById('btn-duplicate-badge');
    document.getElementById('duplicate-count').textContent = count;
    badge.classList.toggle('hidden', count === 0);
  }

  function showDuplicateModal() {
    const list = document.getElementById('duplicate-entries-list');
    if (duplicateEntriesData.length === 0) {
      list.innerHTML = '<p class="text-muted" style="padding: 16px;">重複入室の記録はありません</p>';
    } else {
      list.innerHTML = `
        <table class="data-table">
          <thead>
            <tr><th>スート</th><th>番号</th><th>発生時刻</th></tr>
          </thead>
          <tbody>
            ${duplicateEntriesData.map(e => `
              <tr>
                <td style="color:${Utils.suitToColor(e.suit)};">${e.suit}</td>
                <td>${Utils.cardNumberToLabel(e.card_number)}</td>
                <td style="font-size:13px;">${Utils.formatTime(e.occurred_at)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
    document.getElementById('duplicate-entries-modal').classList.remove('hidden');
  }

  // =============================================
  // AI対話ログ
  // =============================================
  const INAPPROPRIATE_WORDS = [
    '死ね', '殺す', 'バカ', 'ばか', 'うざい', 'ウザい',
    'クソ', 'くそ', 'むかつく', 'アホ', 'あほ', 'カス', 'かす',
    'ざけんな', '消えろ',
  ];

  const AI_TYPE_LABEL = {
    summary_feedback: '要約フィードバック',
    explanation: '説明練習',
    opinion_feedback: '意見フィードバック',
  };

  async function loadAiInteractions() {
    if (!selectedSessionId) return;
    const container = document.getElementById('ai-log-body');
    container.innerHTML = '<p class="text-muted" style="padding:8px;font-size:13px;">読み込み中...</p>';
    try {
      const interactions = await DB.getAiInteractionsBySession(selectedSessionId);
      renderAiLog(interactions);
    } catch (err) {
      container.innerHTML = '<p class="text-muted" style="padding:8px;">読み込みに失敗しました</p>';
    }
  }

  function renderAiLog(interactions) {
    const container = document.getElementById('ai-log-body');
    if (!interactions || interactions.length === 0) {
      container.innerHTML = '<p class="text-muted" style="padding:8px;font-size:13px;">AI対話の記録はありません</p>';
      return;
    }

    const rows = interactions.map(item => {
      const msgs = item.messages || [];
      const userText = msgs
        .filter(m => m.role === 'user')
        .map(m => m.content)
        .join(' / ');
      const aiText = msgs
        .filter(m => m.role === 'assistant')
        .map(m => m.content)
        .join(' / ');
      const isInappropriate = INAPPROPRIATE_WORDS.some(w => userText.includes(w));
      const rowStyle = isInappropriate ? 'background:#fef2f2;' : '';
      const suitColor = Utils.suitToColor(item.suit || '♤');
      const userDisplay = Utils._escapeHtml(
        userText.length > 120 ? userText.slice(0, 120) + '...' : userText
      );
      const aiDisplay = Utils._escapeHtml(
        aiText.length > 120 ? aiText.slice(0, 120) + '...' : aiText
      );
      return `
        <tr style="${rowStyle}">
          <td style="color:${suitColor};white-space:nowrap;">${item.suit || '?'}</td>
          <td style="white-space:nowrap;">${item.card_number != null ? Utils.cardNumberToLabel(item.card_number) : '?'}</td>
          <td style="font-size:12px;white-space:nowrap;">${AI_TYPE_LABEL[item.interaction_type] || item.interaction_type}</td>
          <td style="font-size:12px;max-width:200px;word-break:break-all;">${isInappropriate ? '🚨 ' : ''}${userDisplay}</td>
          <td style="font-size:12px;max-width:200px;word-break:break-all;">${aiDisplay}</td>
          <td style="font-size:12px;white-space:nowrap;">${Utils.formatTime(item.created_at)}</td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>スート</th><th>番号</th><th>種類</th>
              <th>生徒の入力</th><th>AIの返答</th><th>時刻</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  // =============================================
  // セッション未設定の授業警告
  // =============================================
  async function loadNoSessionWarning() {
    try {
      const lessons = await DB.getLessonsWithoutSessions();
      const el = document.getElementById('no-session-warning');
      if (!el) return;
      if (lessons.length === 0) {
        el.classList.add('hidden');
        return;
      }
      const names = lessons.map(l => Utils._escapeHtml(l.name)).join('、');
      el.classList.remove('hidden');
      el.innerHTML = `⚠️ 実施クラス未設定の授業: <strong>${names}</strong> — <a href="lesson-admin.html">授業管理</a>でクラスを追加してください。`;
    } catch (e) {
      // 警告表示失敗は無視
    }
  }

  // ページ離脱時にクリーンアップ
  window.addEventListener('beforeunload', () => {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  });

})();
