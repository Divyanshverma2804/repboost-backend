const express = require('express');
const router = express.Router();
const cronJobs = require('../jobs/cron');

// GET /api/health/cron
router.get('/cron', (req, res) => {
  const now = new Date();
  const lastRuns = cronJobs.getLastRunAt();
  const lastRun = lastRuns.communication;
  const timeSinceLastRun = lastRun ? now.getTime() - lastRun.getTime() : null;

  // If it hasn't run in over 15 minutes, it's likely unhealthy
  // The job is scheduled for every 10 minutes
  const isHealthy = timeSinceLastRun !== null && timeSinceLastRun < 15 * 60 * 1000;

  if (isHealthy) {
    res.status(200).json({
      status: 'ok',
      lastRunAt: lastRun,
      timeSinceLastRun: `${Math.round(timeSinceLastRun / 1000)}s ago`,
      allLastRuns: lastRuns
    });
  } else {
    res.status(503).json({
      status: 'error',
      message: 'Cron job has not run successfully in the expected interval.',
      lastRunAt: lastRun,
      allLastRuns: lastRuns
    });
  }
});

module.exports = router;
