const prisma = require('../config/database');

class AuditLogService {
  /**
   * Create an audit log entry
   * @param {string} action - The action performed (e.g., 'USER_LOGIN', 'BUSINESS_CREATE')
   * @param {string} [userId] - The ID of the user who performed the action
   * @param {object} [details] - Additional JSON details about the event
   */
  async log(action, userId = null, details = null) {
    try {
      await prisma.auditLog.create({
        data: {
          action,
          userId,
          details,
        },
      });
    } catch (error) {
      console.error('Failed to write to audit log:', error);
    }
  }
}

module.exports = new AuditLogService();
