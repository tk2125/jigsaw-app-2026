// =============================================
// Claude API クライアント（Edge Function経由）
// =============================================
window.ClaudeAPI = {

  // Edge Functionを呼び出す内部メソッド
  async _call(type, payload) {
    const url = `${window.APP_CONFIG.EDGE_FUNCTION_BASE_URL}/claude-proxy`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + window.APP_CONFIG.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ type, payload }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.message;
  },

  // 要約へのフィードバック
  async getSummaryFeedback(summaryText, materialContent) {
    return this._call('summary_feedback', { summaryText, materialContent });
  },

  // 説明練習開始（AIが生徒役として最初の質問を返す）
  async startExplanationPractice(summaryText, materialContent) {
    return this._call('explanation_start', { summaryText, materialContent });
  },

  // 説明練習の続き
  async continueExplanation(messages) {
    return this._call('explanation_continue', { messages });
  },

  // コピペ判定
  async checkCopyPaste(summaryText, materialContent) {
    console.log('[checkCopyPaste] 開始', { summaryLength: summaryText.length, materialLength: materialContent.length });
    let raw;
    try {
      raw = await this._call('copy_check', { summaryText, materialContent });
      console.log('[checkCopyPaste] Edge Function レスポンス raw:', raw);
    } catch (err) {
      console.error('[checkCopyPaste] エラー詳細:', err);
      console.error('[checkCopyPaste] スタック:', err.stack);
      return { copied: true, feedback: 'AIチェック中にエラーが発生しました。しばらくしてから再試行してください。（開発者確認用：' + err.message + '）' };
    }
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        console.log('[checkCopyPaste] パース結果:', result);
        return result;
      }
      console.warn('[checkCopyPaste] JSONが見つからない。raw=', raw);
    } catch (err) {
      console.error('[checkCopyPaste] JSONパースエラー:', err, 'raw=', raw);
    }
    return { copied: false, feedback: '' };
  },

  // Opinionへのフィードバック
  async getOpinionFeedback({ opinionText, positionChoice, centralQuestion, requiredTerms, rubricLogicCriteria, rubricSourceCriteria, usedTerms }) {
    return this._call('opinion_feedback', {
      opinionText,
      positionChoice,
      centralQuestion,
      requiredTerms,
      rubricLogicCriteria,
      rubricSourceCriteria,
      usedTerms,
    });
  },
};
