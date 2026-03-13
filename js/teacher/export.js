// =============================================
// CSVエクスポート
// =============================================
window.TeacherExport = {

  async exportCSV(lessonSessionId, lessonName) {
    Utils.setLoading(true);
    try {
      const rows = await DB.getExportData(lessonSessionId);

      const header = [
        'スート', '数字', 'ジョーカー',
        '要約', '要約提出時刻',
        '立場', '使用語句', '意見文',
        '論理スコア', '根拠スコア', 'Opinion提出時刻',
      ];

      const dataRows = rows.map(r => [
        r.suit || '',
        Utils.cardNumberToLabel(r.card_number),
        r.is_joker ? 'はい' : 'いいえ',
        r.summary_text || '',
        r.summary_submitted_at ? Utils.formatTime(r.summary_submitted_at) : '',
        r.position_choice || '',
        (r.required_terms_used || []).join('・'),
        r.opinion_text || '',
        r.rubric_logic_score || '',
        r.rubric_source_score || '',
        r.opinion_submitted_at ? Utils.formatTime(r.opinion_submitted_at) : '',
      ]);

      const today = new Date();
      const dateStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
      const filename = `授業データ_${lessonName || 'export'}_${dateStr}`;

      Utils.downloadCSV([header, ...dataRows], filename);
      Utils.showSuccess('CSVをダウンロードしました');
    } catch (err) {
      Utils.showError('エクスポートに失敗しました: ' + err.message);
    } finally {
      Utils.setLoading(false);
    }
  },
};
