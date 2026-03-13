// =============================================
// Claude API クライアント（Edge Function経由）
// =============================================
window.ClaudeAPI = {

  // Edge Functionを呼び出す内部メソッド
  async _call(type, payload) {
    const url = `${window.APP_CONFIG.EDGE_FUNCTION_BASE_URL}/claude-proxy`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
