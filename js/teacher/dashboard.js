// =============================================
// ダッシュボード ロジック
// =============================================
(function () {
  let selectedSessionId = null;
  let selectedLessonName = '';
  let autoRefreshInterval = null;
  let exchangePhaseOn = false;

  const REFRESH_INTERVAL_MS = 20000; // 20秒

  // =============================================
  // 初期化
  // =============================================
  document.addEventListener('DOMContentLoaded', async () => {
    const ok = await TeacherAuth.checkAuth();
    if (!ok) return;

    setupEventListeners();
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

    // CSVエクスポート
    document.getElementById('btn-export-csv').addEventListener('click', () => {
      if (!selectedSessionId) return;
      TeacherExport.exportCSV(selectedSessionId, selectedLessonName);
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

    container.innerHTML = sessions.map(s => `
      <div class="session-row ${s.is_active ? 'active-session' : ''}" data-session-id="${s.id}">
        <div class="session-info">
          <div class="session-name">
            ${s.is_active ? '🟢 ' : ''}${s.lesson_name} — ${s.class_name}
          </div>
          <div class="session-meta">${Utils.formatDate(s.session_date)} ${s.is_active ? '（アクティブ）' : ''}</div>
        </div>
        <div class="session-actions">
          ${!s.is_active
            ? `<button class="btn btn-success btn-sm btn-activate" data-id="${s.id}" data-lesson="${s.lesson_name}">アクティブにする</button>`
            : `<button class="btn btn-secondary btn-sm btn-deactivate" data-id="${s.id}">停止</button>`
          }
          <button class="btn btn-primary btn-sm btn-select-session" data-id="${s.id}" data-lesson="${s.lesson_name}">
            モニタリング →
          </button>
        </div>
      </div>
    `).join('');

    // アクティブ化ボタン
    container.querySelectorAll('.btn-activate').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`「${btn.dataset.lesson}」をアクティブにしますか？\n同一授業の他のセッションは停止されます。`)) return;
        Utils.setLoading(true);
        try {
          await DB.setActiveSession(btn.dataset.id);
          Utils.showSuccess('アクティブにしました');
          loadSessionList();
        } catch (err) {
          Utils.showError('切り替えに失敗しました: ' + err.message);
        } finally {
          Utils.setLoading(false);
        }
      });
    });

    // 停止ボタン
    container.querySelectorAll('.btn-deactivate').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('このセッションを停止しますか？')) return;
        Utils.setLoading(true);
        try {
          await DB.deactivateSession(btn.dataset.id);
          Utils.showSuccess('停止しました');
          loadSessionList();
        } catch (err) {
          Utils.showError('停止に失敗しました: ' + err.message);
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
  }

  // =============================================
  // ダッシュボードデータ読み込み & 描画
  // =============================================
  async function loadDashboardData() {
    if (!selectedSessionId) return;

    try {
      // セッションステータスとダッシュボードデータを並行取得
      const [status, dashData] = await Promise.all([
        DB.getLessonSessionStatus(selectedSessionId),
        DB.getDashboardData(selectedSessionId),
      ]);

      // 意見交換フェーズ状態を反映
      exchangePhaseOn = status.exchange_phase_on;
      document.getElementById('toggle-exchange').checked = exchangePhaseOn;
      updateExchangeToggleUI(exchangePhaseOn);

      // 統計
      renderStats(dashData);

      // 提出状況テーブル
      renderStudentTable(dashData.students);

      // 語句ランキング
      renderTermsRanking(dashData.termUsageCounts);

      // 立場分布グラフ
      renderPositionChart(dashData.positionStats);

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

    tbody.innerHTML = students.map(s => {
      const suitColor = Utils.suitToColor(s.suit);
      const summaryOk = s.summary_submitted_at;
      const opinionOk = s.opinion_submitted_at;
      return `
        <tr>
          <td class="suit-cell" style="color: ${suitColor};">${s.suit}${s.is_joker ? ' 🃏' : ''}</td>
          <td>${Utils.cardNumberToLabel(s.card_number)}</td>
          <td class="check-cell">${summaryOk ? '<span style="color:var(--color-success);">✓</span>' : '<span style="color:var(--color-border);">—</span>'}</td>
          <td class="check-cell">${opinionOk ? '<span style="color:var(--color-success);">✓</span>' : '<span style="color:var(--color-border);">—</span>'}</td>
          <td>${s.position_choice || '<span class="text-muted">—</span>'}</td>
        </tr>
      `;
    }).join('');
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
        ${term}
        <span class="term-count">${count}</span>
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
          <div class="mini-bar-label">${key}</div>
        </div>
      `;
    }).join('');
  }

  function updateExchangeToggleUI(enabled) {
    const label = document.getElementById('exchange-status-label');
    label.textContent = enabled ? 'ON（開催中）' : 'OFF';
    label.style.color = enabled ? 'var(--color-success)' : 'var(--color-text-muted)';
  }

  // ページ離脱時にクリーンアップ
  window.addEventListener('beforeunload', () => {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  });

})();
