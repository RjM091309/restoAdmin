const ApiResponse = require('../utils/apiResponse');
const { runAnalyticsChat, runManagementBrief } = require('../services/analyticsAiService');

class AnalyticsAiController {
  static async managementBrief(req, res) {
    try {
      const { start_date, end_date, locale } = req.body || {};
      const data = await runManagementBrief({
        start_date: String(start_date || '').trim(),
        end_date: String(end_date || '').trim(),
        locale: String(locale || 'en').trim().slice(0, 10),
      });
      return ApiResponse.success(res, data, 'Management brief generated');
    } catch (error) {
      console.error('[AnalyticsAI] management-brief error:', error);
      const msg = error?.message || 'Failed to generate management brief';
      const status = /required|invalid/i.test(msg) ? 400 : 500;
      return ApiResponse.error(res, msg, status, msg);
    }
  }

  static async chat(req, res) {
    try {
      const { message, start_date, end_date, locale, history } = req.body || {};
      const msg = String(message || '').trim();
      const data = await runAnalyticsChat({
        message: msg,
        start_date: String(start_date || '').trim(),
        end_date: String(end_date || '').trim(),
        // Prefer explicit client locale; message language is resolved again server-side.
        locale: String(locale || 'en').trim().slice(0, 10),
        history: Array.isArray(history) ? history : [],
      });
      return ApiResponse.success(res, data, 'Analytics AI response generated');
    } catch (error) {
      console.error('[AnalyticsAI] chat error:', error);
      const msg = error?.message || 'Failed to generate analytics insights';
      const status = /required|invalid/i.test(msg) ? 400 : 500;
      return ApiResponse.error(res, msg, status, msg);
    }
  }
}

module.exports = AnalyticsAiController;
