const cron = require('node-cron');
const communicationService = require('../services/communicationService');

class CronJobs {
  constructor() {
    this.lastRunTimestamps = {
      communication: null,
      reminders: null,
      aiAnalytics: null,
      monthlyReset: null
    };
  }

  startAll() {
    this.startSmsEmailProcessor();
    this.startReminderProcessor();
    this.startWeeklyAiAnalytics();
    this.startMonthlyReset();
  }

  /**
   * Process pending SMS/Email every 10 minutes, on the 0-minute mark.
   */
  startSmsEmailProcessor() {
    cron.schedule('*/10 * * * *', async () => {
      console.log('\n📅 [CRON] Communication Processor triggered');
      await communicationService.processPendingSends();
      this.lastRunTimestamps.communication = new Date();
    });

    console.log('✅ Communication Processor cron scheduled (every 10 min)');
  }

  /**
   * Process reminders every 10 minutes, staggered 5 minutes.
   */
  startReminderProcessor() {
    cron.schedule('5-59/10 * * * *', async () => {
      console.log('\n📅 [CRON] Reminder Processor triggered');
      await communicationService.processReminders();
      this.lastRunTimestamps.reminders = new Date();
    });

    console.log('✅ Reminder Processor cron scheduled (every 10 min, offset :05)');
  }

  /**
   * Weekly AI Sentiment Analytics every Sunday at midnight
   */
  startWeeklyAiAnalytics() {
    cron.schedule('0 0 * * 0', async () => {
      console.log('\n📅 [CRON] Weekly AI Analytics triggered');
      await communicationService.runWeeklyAiAnalytics();
      this.lastRunTimestamps.aiAnalytics = new Date();
    });

    console.log('✅ Weekly AI Analytics cron scheduled (Sunday midnight)');
  }

  /**
   * Reset monthly counters on the 1st of each month at midnight.
   */
  startMonthlyReset() {
    cron.schedule('0 0 1 * *', async () => {
      console.log('\n📅 [CRON] Monthly Reset triggered');
      await communicationService.resetMonthlyCounters();
      this.lastRunTimestamps.monthlyReset = new Date();
    });

    console.log('✅ Monthly Reset cron scheduled (1st of month, midnight)');
  }

  getLastRunAt() {
    return this.lastRunTimestamps;
  }
}

module.exports = new CronJobs();