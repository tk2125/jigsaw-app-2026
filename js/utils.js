// =============================================
// 共通ユーティリティ
// =============================================
window.Utils = {

  // sessionStorageのキー定数
  SESSION_KEYS: {
    SESSION_ID: 'jigsaw_session_id',
    LESSON_SESSION_ID: 'jigsaw_lesson_session_id',
    SUIT: 'jigsaw_suit',
    CARD_NUMBER: 'jigsaw_card_number',
    IS_JOKER: 'jigsaw_is_joker',
    READONLY: 'jigsaw_readonly',
    LESSON_DATA: 'jigsaw_lesson_data',
  },

  // 文字列正規化（全角→半角、大文字→小文字、前後空白除去）
  normalizeString(str) {
    if (!str) return '';
    return str.normalize('NFKC').toLowerCase().trim();
  },

  // パスワード照合（入力を正規化してDBの正規化済みパスワード配列と比較）
  checkPassword(inputPassword, normalizedPasswords) {
    const normalized = this.normalizeString(inputPassword);
    return normalizedPasswords.includes(normalized);
  },

  // スート→インデックス
  suitToIndex(suit) {
    return { '♤': 0, '♧': 1, '♡': 2, '♢': 3 }[suit] ?? -1;
  },

  // インデックス→スート
  indexToSuit(index) {
    return ['♤', '♧', '♡', '♢'][index] ?? null;
  },

  // スート→日本語名
  suitToName(suit) {
    return { '♤': 'スペード', '♧': 'クラブ', '♡': 'ハート', '♢': 'ダイヤ' }[suit] ?? suit;
  },

  // スート→色
  suitToColor(suit) {
    return (suit === '♡' || suit === '♢') ? '#dc2626' : '#1e293b';
  },

  // カード番号→表示文字
  cardNumberToLabel(num) {
    const n = parseInt(num);
    if (n === 1) return 'A';
    if (n === 11) return 'J';
    if (n === 12) return 'Q';
    if (n === 13) return 'K';
    return String(n);
  },

  // 日付フォーマット
  formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  },

  // 時刻フォーマット（HH:MM:SS）
  formatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('ja-JP');
  },

  // テキスト中の指定語句を<mark>でハイライト
  highlightTerms(text, terms) {
    if (!text) return '';
    if (!terms || terms.length === 0) return this._escapeHtml(text);
    let result = this._escapeHtml(text);
    terms.forEach(term => {
      if (!term) return;
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'g');
      result = result.replace(re, `<mark>${term}</mark>`);
    });
    return result;
  },

  _escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  // エラーメッセージ表示
  showError(message) {
    const el = document.getElementById('error-message');
    if (!el) { alert(message); return; }
    el.textContent = message;
    el.classList.remove('hidden');
    const success = document.getElementById('success-message');
    if (success) success.classList.add('hidden');
    setTimeout(() => el.classList.add('hidden'), 5000);
  },

  // 成功メッセージ表示
  showSuccess(message) {
    const el = document.getElementById('success-message');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
    const error = document.getElementById('error-message');
    if (error) error.classList.add('hidden');
    setTimeout(() => el.classList.add('hidden'), 3000);
  },

  // ローディング表示切り替え
  setLoading(visible) {
    const el = document.getElementById('loading');
    if (!el) return;
    el.classList.toggle('hidden', !visible);
  },

  // UUID v4生成
  generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  // sessionStorageから授業データを取得
  getLessonData() {
    try {
      const raw = sessionStorage.getItem(this.SESSION_KEYS.LESSON_DATA);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  // sessionStorageに授業データを保存
  saveLessonData(data) {
    sessionStorage.setItem(this.SESSION_KEYS.LESSON_DATA, JSON.stringify(data));
  },

  // セッションが有効かチェック
  hasValidSession() {
    return !!(
      sessionStorage.getItem(this.SESSION_KEYS.SESSION_ID) &&
      sessionStorage.getItem(this.SESSION_KEYS.LESSON_SESSION_ID)
    );
  },

  // sessionStorageをクリア
  clearSession() {
    Object.values(this.SESSION_KEYS).forEach(k => sessionStorage.removeItem(k));
  },

  // CSVダウンロード
  downloadCSV(rows, filename) {
    const bom = '\uFEFF'; // Excel用BOM
    const csv = bom + rows.map(row =>
      row.map(cell => {
        const s = String(cell ?? '');
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      }).join(',')
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.csv') ? filename : filename + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  },

  // 現在時刻をHH:MM:SS形式で返す
  nowTimeStr() {
    return new Date().toLocaleTimeString('ja-JP');
  },
};
