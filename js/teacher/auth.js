// =============================================
// 教師認証ロジック
// =============================================
window.TeacherAuth = {

  // ログイン処理（teacher/index.htmlで使用）
  async handleLogin() {
    const email = document.getElementById('input-email')?.value?.trim();
    const password = document.getElementById('input-password')?.value;
    if (!email || !password) {
      Utils.showError('メールアドレスとパスワードを入力してください');
      return;
    }
    Utils.setLoading(true);
    try {
      await DB.signInTeacher(email, password);
      window.location.href = 'dashboard.html';
    } catch (err) {
      Utils.showError('ログインに失敗しました: ' + (err.message || '認証エラー'));
    } finally {
      Utils.setLoading(false);
    }
  },

  // ログアウト
  async handleLogout() {
    Utils.setLoading(true);
    try {
      await DB.signOutTeacher();
      window.location.href = 'index.html';
    } catch (err) {
      window.location.href = 'index.html';
    } finally {
      Utils.setLoading(false);
    }
  },

  // 認証チェック（各教師ページで呼び出す）
  async checkAuth() {
    const session = await DB.getTeacherSession();
    if (!session) {
      window.location.href = 'index.html';
      return false;
    }
    return true;
  },
};

// =============================================
// ログインページ用の初期化
// =============================================
document.addEventListener('DOMContentLoaded', async () => {
  // ログインページにいる場合の処理
  const loginBtn = document.getElementById('btn-login');
  if (!loginBtn) return;

  // 既にログイン済みならダッシュボードへ
  const session = await DB.getTeacherSession();
  if (session) {
    window.location.href = 'dashboard.html';
    return;
  }

  loginBtn.addEventListener('click', () => TeacherAuth.handleLogin());

  document.getElementById('input-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') TeacherAuth.handleLogin();
  });
});
