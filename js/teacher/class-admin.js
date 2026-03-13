// =============================================
// クラス管理ページ ロジック
// =============================================
(function () {
  let selectedYearId = null;

  // =============================================
  // 初期化
  // =============================================
  document.addEventListener('DOMContentLoaded', async () => {
    const ok = await TeacherAuth.checkAuth();
    if (!ok) return;

    document.getElementById('btn-logout').addEventListener('click', () => TeacherAuth.handleLogout());

    // 年度追加
    document.getElementById('btn-add-year').addEventListener('click', addYear);
    document.getElementById('input-new-year').addEventListener('keydown', e => {
      if (e.key === 'Enter') addYear();
    });

    // クラス追加
    document.getElementById('btn-add-class').addEventListener('click', addClass);
    document.getElementById('input-new-class').addEventListener('keydown', e => {
      if (e.key === 'Enter') addClass();
    });

    await loadYears();
  });

  // =============================================
  // 年度の読み込み・描画
  // =============================================
  async function loadYears() {
    Utils.setLoading(true);
    try {
      const years = await DB.getAcademicYears();
      renderYears(years);
    } catch (err) {
      Utils.showError('年度の読み込みに失敗しました: ' + err.message);
    } finally {
      Utils.setLoading(false);
    }
  }

  function renderYears(years) {
    const container = document.getElementById('year-list');
    if (!years || years.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>年度がありません</p></div>';
      return;
    }

    container.innerHTML = years.map(y => `
      <div class="year-item ${selectedYearId === y.id ? 'selected' : ''}" data-id="${y.id}">
        <span class="item-name">${y.year_label}</span>
        <div class="item-actions">
          <button class="btn btn-danger btn-sm btn-delete-year" data-id="${y.id}" data-label="${y.year_label}">削除</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.year-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.btn-delete-year')) return;
        selectYear(item.dataset.id);
      });
    });

    container.querySelectorAll('.btn-delete-year').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteYear(btn.dataset.id, btn.dataset.label);
      });
    });
  }

  async function selectYear(yearId) {
    selectedYearId = yearId;
    // ハイライト更新
    document.querySelectorAll('.year-item').forEach(item => {
      item.classList.toggle('selected', item.dataset.id === yearId);
    });
    await loadClasses(yearId);
  }

  // =============================================
  // 年度の追加・削除
  // =============================================
  async function addYear() {
    const input = document.getElementById('input-new-year');
    const label = input.value.trim();
    if (!label) {
      Utils.showError('年度名を入力してください');
      return;
    }
    Utils.setLoading(true);
    try {
      await DB.createAcademicYear(label);
      input.value = '';
      Utils.showSuccess('年度を追加しました');
      await loadYears();
    } catch (err) {
      Utils.showError('追加に失敗しました: ' + err.message);
    } finally {
      Utils.setLoading(false);
    }
  }

  async function deleteYear(yearId, label) {
    if (!confirm(`「${label}」を削除しますか？\n関連するクラスも全て削除されます。`)) return;
    Utils.setLoading(true);
    try {
      await DB.deleteAcademicYear(yearId);
      if (selectedYearId === yearId) {
        selectedYearId = null;
        document.getElementById('class-list').innerHTML = '<div class="empty-state"><p>年度を選んでください</p></div>';
        document.getElementById('class-add-form').classList.add('hidden');
        document.getElementById('class-panel-title').textContent = 'クラス';
      }
      Utils.showSuccess('削除しました');
      await loadYears();
    } catch (err) {
      Utils.showError('削除に失敗しました: ' + err.message);
    } finally {
      Utils.setLoading(false);
    }
  }

  // =============================================
  // クラスの読み込み・描画
  // =============================================
  async function loadClasses(yearId) {
    Utils.setLoading(true);
    try {
      const classes = await DB.getClasses(yearId);
      // パネルタイトルを更新
      const yearEl = document.querySelector(`.year-item[data-id="${yearId}"] .item-name`);
      if (yearEl) {
        document.getElementById('class-panel-title').textContent = yearEl.textContent + ' のクラス';
      }
      document.getElementById('class-add-form').style.display = 'flex';
      renderClasses(classes);
    } catch (err) {
      Utils.showError('クラスの読み込みに失敗しました: ' + err.message);
    } finally {
      Utils.setLoading(false);
    }
  }

  function renderClasses(classes) {
    const container = document.getElementById('class-list');
    if (!classes || classes.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>クラスがありません</p></div>';
      return;
    }

    container.innerHTML = classes.map(c => `
      <div class="class-item" data-id="${c.id}">
        <span class="item-name">${c.name}</span>
        <div class="item-actions">
          <button class="btn btn-danger btn-sm btn-delete-class" data-id="${c.id}" data-name="${c.name}">削除</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.btn-delete-class').forEach(btn => {
      btn.addEventListener('click', () => deleteClass(btn.dataset.id, btn.dataset.name));
    });
  }

  // =============================================
  // クラスの追加・削除
  // =============================================
  async function addClass() {
    if (!selectedYearId) {
      Utils.showError('年度を選んでください');
      return;
    }
    const input = document.getElementById('input-new-class');
    const name = input.value.trim();
    if (!name) {
      Utils.showError('クラス名を入力してください');
      return;
    }
    Utils.setLoading(true);
    try {
      await DB.createClass(selectedYearId, name);
      input.value = '';
      Utils.showSuccess('クラスを追加しました');
      await loadClasses(selectedYearId);
    } catch (err) {
      Utils.showError('追加に失敗しました: ' + err.message);
    } finally {
      Utils.setLoading(false);
    }
  }

  async function deleteClass(classId, className) {
    if (!confirm(`「${className}」を削除しますか？`)) return;
    Utils.setLoading(true);
    try {
      await DB.deleteClass(classId);
      Utils.showSuccess('削除しました');
      await loadClasses(selectedYearId);
    } catch (err) {
      Utils.showError('削除に失敗しました: ' + err.message);
    } finally {
      Utils.setLoading(false);
    }
  }

})();
