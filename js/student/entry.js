// =============================================
// 入室ページ ロジック
// =============================================
(function () {
  let selectedSuit = null;
  let foundLesson = null;    // findLessonByPassword の結果
  let isReadonly = false;

  // =============================================
  // 初期化
  // =============================================
  document.addEventListener('DOMContentLoaded', async () => {
    // 既存セッションチェック
    if (Utils.hasValidSession()) {
      document.getElementById('step-password').classList.add('hidden');
      document.getElementById('resume-dialog').classList.remove('hidden');
    }

    setupEventListeners();
  });

  function setupEventListeners() {
    // 既存セッション: 続きから
    document.getElementById('btn-resume').addEventListener('click', () => {
      resumeSession(false);
    });

    // 既存セッション: 過去データ閲覧
    document.getElementById('btn-view-past').addEventListener('click', () => {
      resumeSession(true);
    });

    // 既存セッション: 新規入室
    document.getElementById('btn-new-entry').addEventListener('click', () => {
      Utils.clearSession();
      document.getElementById('resume-dialog').classList.add('hidden');
      document.getElementById('step-password').classList.remove('hidden');
    });

    // パスワード送信
    document.getElementById('btn-password-submit').addEventListener('click', handlePasswordSubmit);
    document.getElementById('input-password').addEventListener('keydown', e => {
      if (e.key === 'Enter') handlePasswordSubmit();
    });

    // スートボタン
    document.querySelectorAll('.suit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.suit-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedSuit = btn.dataset.suit;
        checkJokerMessage();
      });
    });

    // トランプ送信
    document.getElementById('btn-trump-submit').addEventListener('click', handleTrumpSubmit);
    document.getElementById('btn-trump-back').addEventListener('click', () => {
      document.getElementById('step-trump').classList.add('hidden');
      document.getElementById('step-password').classList.remove('hidden');
      selectedSuit = null;
      foundLesson = null;
    });

    // 数字変更でもジョーカーチェック
    document.getElementById('input-card-number').addEventListener('change', checkJokerMessage);
  }

  // =============================================
  // 既存セッション復帰
  // =============================================
  function resumeSession(readonly) {
    isReadonly = readonly;
    sessionStorage.setItem(Utils.SESSION_KEYS.READONLY, String(readonly));

    const sessionId = sessionStorage.getItem(Utils.SESSION_KEYS.SESSION_ID);
    const lessonData = Utils.getLessonData();

    if (!sessionId || !lessonData) {
      Utils.clearSession();
      document.getElementById('resume-dialog').classList.add('hidden');
      document.getElementById('step-password').classList.remove('hidden');
      return;
    }

    // 既存セッションを読み込んで適切なページへ
    Utils.setLoading(true);
    DB.getStudentSessionById(sessionId).then(session => {
      Utils.setLoading(false);
      if (!session) {
        Utils.clearSession();
        document.getElementById('resume-dialog').classList.add('hidden');
        document.getElementById('step-password').classList.remove('hidden');
        return;
      }
      redirectByProgress(session);
    }).catch(err => {
      Utils.setLoading(false);
      Utils.showError('データの読み込みに失敗しました: ' + err.message);
    });
  }

  // =============================================
  // パスワード送信処理
  // =============================================
  async function handlePasswordSubmit() {
    const password = document.getElementById('input-password').value.trim();
    if (!password) {
      Utils.showError('パスワードを入力してください');
      return;
    }

    Utils.setLoading(true);
    try {
      const result = await DB.findLessonByPassword(password);
      if (!result) {
        Utils.showError('パスワードが正しくありません。先生に確認してください。');
        return;
      }

      foundLesson = result;
      Utils.setLoading(false);

      // suit_count=3 の場合、♢ボタンを無効化（ただし後でジョーカー処理で使うかも）
      // スートボタンの表示制御はここで行う
      updateSuitButtons(result.lesson.suit_count);

      // トランプ入力ステップへ
      document.getElementById('step-password').classList.add('hidden');
      document.getElementById('step-trump').classList.remove('hidden');

    } catch (err) {
      Utils.showError('エラーが発生しました: ' + err.message);
    } finally {
      Utils.setLoading(false);
    }
  }

  // =============================================
  // スートボタンの表示制御
  // =============================================
  function updateSuitButtons(suitCount) {
    const diamondBtn = document.querySelector('.suit-btn[data-suit="♢"]');
    if (suitCount === 3) {
      // ♢は選べるが、選んだ場合は余り処理の対象
      diamondBtn.style.opacity = '0.5';
      diamondBtn.title = '余り処理の対象になります';
    } else {
      diamondBtn.style.opacity = '1';
      diamondBtn.title = '';
    }
  }

  // =============================================
  // ジョーカーメッセージ表示チェック
  // =============================================
  function checkJokerMessage() {
    if (!foundLesson) return;
    const jokerMsg = document.getElementById('joker-message');
    const lesson = foundLesson.lesson;

    if (lesson.suit_count === 3 && selectedSuit === '♢') {
      if (lesson.remainder_type === 'joker') {
        jokerMsg.classList.remove('hidden');
        jokerMsg.textContent = '🃏 今日は好きなグループに入ってください';
      } else {
        // priority_suit: ♢をpriority_suitとして扱う
        jokerMsg.classList.remove('hidden');
        jokerMsg.textContent = `ℹ️ あなたは【${Utils.suitToName(lesson.priority_suit)}】グループとして参加します`;
      }
    } else {
      jokerMsg.classList.add('hidden');
    }
  }

  // =============================================
  // トランプ送信処理
  // =============================================
  async function handleTrumpSubmit() {
    if (!selectedSuit) {
      Utils.showError('スート（マーク）を選んでください');
      return;
    }
    const cardNumber = document.getElementById('input-card-number').value;
    if (!cardNumber) {
      Utils.showError('数字を選んでください');
      return;
    }
    if (!foundLesson) {
      Utils.showError('授業データが見つかりません。もう一度パスワードから入力してください。');
      return;
    }

    const lesson = foundLesson.lesson;
    const lessonSessionId = foundLesson.lessonSession.id;

    // ジョーカー/余り処理の判定
    let actualSuit = selectedSuit;
    let isJoker = false;

    if (lesson.suit_count === 3 && selectedSuit === '♢') {
      if (lesson.remainder_type === 'joker') {
        isJoker = true;
        // ジョーカーは任意のスート（内部的にはダイヤとして保存）
        actualSuit = '♢';
      } else {
        // priority_suit に変換
        actualSuit = lesson.priority_suit;
      }
    }

    Utils.setLoading(true);
    try {
      // 既存セッションを検索
      let session = await DB.findExistingStudentSession(lessonSessionId, actualSuit, parseInt(cardNumber));

      if (session) {
        // 既存セッションがある場合
        if (session.opinion_submitted_at) {
          // Opinion提出済み → 閲覧確認
          if (confirm('このカードの提出済みデータがあります。閲覧モードで開きますか？（編集はできません）')) {
            isReadonly = true;
            sessionStorage.setItem(Utils.SESSION_KEYS.READONLY, 'true');
          } else {
            isReadonly = false;
            sessionStorage.setItem(Utils.SESSION_KEYS.READONLY, 'false');
          }
        } else {
          isReadonly = false;
          sessionStorage.setItem(Utils.SESSION_KEYS.READONLY, 'false');
        }
      } else {
        // 新規セッション作成
        session = await DB.createStudentSession(lessonSessionId, actualSuit, parseInt(cardNumber), isJoker);
        sessionStorage.setItem(Utils.SESSION_KEYS.READONLY, 'false');
      }

      // sessionStorageに保存
      sessionStorage.setItem(Utils.SESSION_KEYS.SESSION_ID, session.id);
      sessionStorage.setItem(Utils.SESSION_KEYS.LESSON_SESSION_ID, lessonSessionId);
      sessionStorage.setItem(Utils.SESSION_KEYS.SUIT, actualSuit);
      sessionStorage.setItem(Utils.SESSION_KEYS.CARD_NUMBER, String(cardNumber));
      sessionStorage.setItem(Utils.SESSION_KEYS.IS_JOKER, String(isJoker));

      Utils.saveLessonData({
        lesson,
        materials: foundLesson.materials,
        lessonSessionId,
      });

      // 進捗に応じてリダイレクト
      redirectByProgress(session);

    } catch (err) {
      Utils.showError('入室に失敗しました: ' + err.message);
    } finally {
      Utils.setLoading(false);
    }
  }

  // =============================================
  // 進捗に応じてリダイレクト
  // =============================================
  function redirectByProgress(session) {
    const readonly = sessionStorage.getItem(Utils.SESSION_KEYS.READONLY) === 'true';

    if (session.opinion_submitted_at && !readonly) {
      // Opinion提出済み → 意見交換へ
      window.location.href = 'student/exchange.html';
    } else if (session.summary_submitted_at) {
      // 要約提出済み → Opinionへ
      window.location.href = 'student/opinion.html';
    } else {
      // まだエキスパート活動
      window.location.href = 'student/expert.html';
    }
  }

})();
