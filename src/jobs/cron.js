const cron = require('node-cron');
const smsAutomationService = require('../services/smsAutomationService');

class CronJobs {
  startAll() {
    this.startSmsProcessor();
    this.startReminderProcessor();
    this.startMonthlyReset();
  }

  /**
   * Process pending SMS every 10 minutes
   */
  startSmsProcessor() {
    cron.schedule('*/10 * * * *', async () => {
      console.log('\n📅 [CRON] SMS Processor triggered');
      await smsAutomationService.processPendingSends();
    });

    console.log('✅ SMS Processor cron scheduled (every 10 minutes)');
  }

  /**
   * Process reminders every 10 minutes
   */
  startReminderProcessor() {
    cron.schedule('*/10 * * * *', async () => {
      console.log('\n📅 [CRON] Reminder Processor triggered');
      await smsAutomationService.processReminders();
    });

    console.log('✅ Reminder Processor cron scheduled (every 10 minutes)');
  }

  /**
   * Reset monthly counters on 1st of each month at midnight
   */
  startMonthlyReset() {
    cron.schedule('0 0 1 * *', async () => {
      console.log('\n📅 [CRON] Monthly Reset triggered');
      await smsAutomationService.resetMonthlyCounters();
    });

    console.log('✅ Monthly Reset cron scheduled (1st of month, midnight)');
  }
}

module.exports = new CronJobs();
