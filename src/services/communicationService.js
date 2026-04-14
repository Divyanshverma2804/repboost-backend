const prisma = require('../config/database');
const twilioService = require('./twilioService');
const emailService = require('./emailService');
const { generateReviewReply, analyzeReviews } = require('./aiService');
const logger = require('../utils/logger');

// In-memory store for the last successful run timestamp
const lastSuccessfulCronRun = {
  timestamp: null,
  get() {
    return this.timestamp;
  },
  set(date) {
    this.timestamp = date;
  }
};

class CommunicationService {
  constructor() {
    this._sendRunning = false;
    this._reminderRunning = false;
  }

  _isValidE164(phone) {
    if (!phone) return false;
    return /^\+\d{8,15}$/.test(String(phone).trim());
  }

  async _getLastSmsLog(customerId) {
    return prisma.smsLog.findFirst({
      where: { customerId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async _shouldBackoffCustomer(customerId) {
    const last = await this._getLastSmsLog(customerId);
    if (!last) return { shouldBackoff: false };
    if (last.status !== 'FAILED') return { shouldBackoff: false };
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const createdAtMs = new Date(last.createdAt).getTime();
    if (createdAtMs >= oneHourAgo) {
      return { shouldBackoff: true, reason: last.providerResponse || 'recent failure' };
    }
    return { shouldBackoff: false };
  }

  async _getBusinessNotificationEmails(businessId) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { notificationEmails: true }
    });

    const fromConfig = business?.notificationEmails
      ? business.notificationEmails.split(',').map(e => e.trim()).filter(Boolean)
      : [];

    if (fromConfig.length > 0) return fromConfig;

    const admins = await prisma.user.findMany({
      where: { businessId, role: 'BUSINESS_ADMIN' },
      select: { email: true }
    });
    return admins.map(a => a.email);
  }

  async _maybeSendSmsQuotaWarning(businessId) {
    try {
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: { id: true, name: true, smsUsedThisMonth: true, smsMonthlyLimit: true }
      });
      if (!business || !business.smsMonthlyLimit) return;
      const usagePercent = Math.floor((business.smsUsedThisMonth / business.smsMonthlyLimit) * 100);
      if (usagePercent < 80) return;

      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const already = await prisma.auditLog.findFirst({
        where: {
          action: 'SMS_QUOTA_WARNING_SENT',
          createdAt: { gte: monthStart },
          details: { path: ['businessId'], equals: businessId }
        }
      });
      if (already) return;

      const recipients = await this._getBusinessNotificationEmails(businessId);
      if (!recipients || recipients.length === 0) return;

      const link = `${process.env.FRONTEND_URL || process.env.APP_URL}/business/dashboard`;
      await Promise.all(
        recipients.map((to) =>
          emailService.sendTemplate(
            to,
            'quota_warning',
            "⚠️ You're running low on SMS credits",
            {
              businessName: business.name,
              used: String(business.smsUsedThisMonth),
              limit: String(business.smsMonthlyLimit),
              usagePercent: String(usagePercent),
              link,
              year: String(new Date().getFullYear())
            }
          )
        )
      );

      await prisma.auditLog.create({
        data: {
          action: 'SMS_QUOTA_WARNING_SENT',
          userId: null,
          details: { businessId, usagePercent, used: business.smsUsedThisMonth, limit: business.smsMonthlyLimit }
        }
      });
    } catch (err) {
      logger.error('Quota warning error:', err);
    }
  }

  async processPendingSends() {
    if (this._sendRunning) return;
    this._sendRunning = true;
    try {
      const now = new Date();
      const dueByBusiness = await prisma.customer.groupBy({
        by: ['businessId'],
        where: {
          sentAt: null,
          sendAt: { lte: now }
        },
        _count: { _all: true }
      });

      if (dueByBusiness.length === 0) {
        logger.info(`[CRON] Communication: no due customers`);
        lastSuccessfulCronRun.set(new Date()); // Still a successful run if there's nothing to do
        return;
      }

      const businessIdList = dueByBusiness.map(b => b.businessId);
      const businesses = await prisma.business.findMany({ where: { id: { in: businessIdList } } });
      const active = businesses.filter(b => b.status === 'ACTIVE');

      const dueSummary = dueByBusiness.map(d => {
        const b = businesses.find(x => x.id === d.businessId);
        const name = b ? b.name : d.businessId;
        const status = b ? b.status : 'UNKNOWN';
        return `${name}(${status}):${d._count._all}`;
      }).join(', ');

      logger.info(`[CRON] Communication: due businesses=${dueByBusiness.length}, active=${active.length} | ${dueSummary}`);

      for (const business of active) {
        await this._processBusiness(business);
      }

      lastSuccessfulCronRun.set(new Date());
    } catch (error) {
      logger.error('processPendingSends error:', error);
    } finally {
      this._sendRunning = false;
    }
  }

  async processReminders() {
    if (this._reminderRunning) return;
    this._reminderRunning = true;
    try {
      const now = new Date();
      const businessIds = await prisma.customer.groupBy({
        by: ['businessId'],
        where: {
          sentAt: { not: null },
          submittedAt: null,
          reminderCount: { lt: 999 } // logic for max reminders handled in _processBusinessReminders
        },
        _count: { _all: true }
      });

      if (businessIds.length === 0) {
        logger.info(`[CRON] Reminder: no pending reminders`);
        return;
      }

      const businesses = await prisma.business.findMany({
        where: {
          id: { in: businessIds.map(b => b.businessId) },
          status: 'ACTIVE'
        }
      });

      const reminderSummary = businessIds.map(d => {
        const b = businesses.find(x => x.id === d.businessId);
        return `${b ? b.name : d.businessId}:${d._count._all}`;
      }).join(', ');
      logger.info(`[CRON] Reminder: businesses=${businessIds.length}, active=${businesses.length} | ${reminderSummary}`);

      for (const business of businesses) {
        await this._processBusinessReminders(business);
      }
    } catch (error) {
      logger.error('processReminders error:', error);
    } finally {
      this._reminderRunning = false;
    }
  }

  async _processBusiness(business) {
    const freshBusiness = await prisma.business.findUnique({
      where: { id: business.id },
      include: {
        templateConfig: {
          include: {
            reviewRequestTemplate: true,
            reminderTemplate: true,
            thankYouTemplate: true,
            negativeFeedbackTemplate: true
          }
        }
      }
    });

    const customers = await prisma.customer.findMany({
      where: {
        businessId: business.id,
        sentAt: null,
        sendAt: { lte: new Date() }
      },
      orderBy: { sendAt: 'asc' },
      take: freshBusiness.rateLimitPerMinute
    });

    const counters = {
      attempted: 0,
      sent: 0,
      failed: 0,
      skippedNoChannel: 0,
      skippedInvalidPhone: 0,
      skippedBackoff: 0,
      skippedQuota: 0,
      skippedNoTemplate: 0,
    };

    logger.info(
      `[CRON] Communication: business="${freshBusiness.name}" due=${customers.length} rateLimit=${freshBusiness.rateLimitPerMinute} smsQuota=${freshBusiness.smsUsedThisMonth}/${freshBusiness.smsMonthlyLimit}`
    );

    for (const customer of customers) {
      const backoff = await this._shouldBackoffCustomer(customer.id);
      if (backoff.shouldBackoff) {
        counters.skippedBackoff++;
        logger.info(`[CRON] Communication: skip customer=${customer.id} reason=backoff`);
        continue;
      }

      // Try WhatsApp first if customer has phone
      if (customer.phone && freshBusiness.smsUsedThisMonth < freshBusiness.smsMonthlyLimit) {
        if (!this._isValidE164(customer.phone)) {
          counters.skippedInvalidPhone++;
          await prisma.smsLog.create({
            data: {
              businessId: business.id,
              customerId: customer.id,
              status: 'FAILED',
              providerResponse: `Invalid phone number: ${customer.phone}`
            }
          });
          logger.error(`[CRON] Communication: invalid phone business="${freshBusiness.name}" customer=${customer.id} phone=${customer.phone}`);
          continue;
        }

        const template = freshBusiness.templateConfig?.reviewRequestTemplate;
        if (!template || !template.twilioTemplateSid) {
          counters.skippedNoTemplate++;
          logger.error(`[CRON] Communication: No approved WhatsApp template for business="${freshBusiness.name}"`);
          // Fallback to old behavior? No, user requested strict template enforcement
          continue;
        }

        const link = `${process.env.APP_URL}/public/feedback/${customer.id}`;
        
        // WhatsApp variables: {{1}} = Name, {{2}} = Business Name, {{3}} = Customer ID
        const variables = {
          "1": customer.name,
          "2": freshBusiness.name,
          "3": customer.id
        };

        counters.attempted++;
        const twilioResponse = await twilioService.sendWhatsAppTemplate(
          customer.phone, 
          template.twilioTemplateSid, 
          variables
        );

        if (twilioResponse.success) {
          await prisma.customer.update({ where: { id: customer.id }, data: { sentAt: new Date() } });
          await prisma.business.update({ where: { id: business.id }, data: { smsUsedThisMonth: { increment: 1 } } });
          await prisma.smsLog.create({
            data: { businessId: business.id, customerId: customer.id, status: 'SENT', providerResponse: `whatsapp_tpl:${twilioResponse.sid || ''}`.trim() }
          });
          await this._maybeSendSmsQuotaWarning(business.id);
          counters.sent++;
          continue; // Move to next customer
        } else {
          counters.failed++;
          await prisma.smsLog.create({
            data: {
              businessId: business.id,
              customerId: customer.id,
              status: 'FAILED',
              providerResponse: String(twilioResponse.error || 'Unknown error')
            }
          });
          logger.error(`[CRON] Communication: WhatsApp Template failed business="${freshBusiness.name}" customer=${customer.id} to=${customer.phone} error=${twilioResponse.error}`);
        }
      }

      if (customer.phone && freshBusiness.smsUsedThisMonth >= freshBusiness.smsMonthlyLimit) {
        counters.skippedQuota++;
        await prisma.smsLog.create({
          data: {
            businessId: business.id,
            customerId: customer.id,
            status: 'QUOTA_BLOCKED',
            providerResponse: `Quota reached ${freshBusiness.smsUsedThisMonth}/${freshBusiness.smsMonthlyLimit}`
          }
        });
        logger.info(`[CRON] Communication: quota blocked business="${freshBusiness.name}" customer=${customer.id}`);
      }

      // Fallback to Email if enabled and customer has email
      if (freshBusiness.emailEnabled && customer.email && freshBusiness.emailUsedThisMonth < freshBusiness.emailMonthlyLimit) {
        const link = `${process.env.APP_URL}/public/feedback/${customer.id}`;
        const body = emailService.formatTemplate(freshBusiness.emailTemplate, {
          name: customer.name,
          business_name: freshBusiness.name,
          link
        });
        
        counters.attempted++;
        const sent = await emailService.sendEmail(customer.email, `Feedback for ${freshBusiness.name}`, body);
        if (sent) {
          await prisma.customer.update({ where: { id: customer.id }, data: { sentAt: new Date() } });
          await prisma.business.update({ where: { id: business.id }, data: { emailUsedThisMonth: { increment: 1 } } });
          counters.sent++;
        } else {
          counters.failed++;
          logger.error(`Failed to send email to ${customer.email}`);
        }
      } else if (!customer.phone && !(freshBusiness.emailEnabled && customer.email)) {
        counters.skippedNoChannel++;
      }
    }

    logger.info(
      `[CRON] Communication: business="${freshBusiness.name}" attempted=${counters.attempted} sent=${counters.sent} failed=${counters.failed} skippedNoChannel=${counters.skippedNoChannel} skippedInvalidPhone=${counters.skippedInvalidPhone} skippedBackoff=${counters.skippedBackoff} skippedQuota=${counters.skippedQuota}`
    );
  }

  async _processBusinessReminders(business) {
    const freshBusiness = await prisma.business.findUnique({
      where: { id: business.id },
      include: {
        templateConfig: {
          include: {
            reminderTemplate: true
          }
        }
      }
    });

    const reminderThreshold = new Date(Date.now() - freshBusiness.reminderDelayHours * 60 * 60 * 1000);

    const customers = await prisma.customer.findMany({
      where: {
        businessId: business.id,
        sentAt: { lte: reminderThreshold },
        submittedAt: null,
        reminderCount: { lt: freshBusiness.maxReminders },
        smsLogs: { some: { status: 'SENT' } }
      },
      orderBy: { sentAt: 'asc' },
      take: freshBusiness.rateLimitPerMinute
    });

    if (customers.length > 0) {
      logger.info(`[CRON] Reminder: business="${freshBusiness.name}" due=${customers.length} threshold=${reminderThreshold.toISOString()}`);
    }

    for (const customer of customers) {
      const backoff = await this._shouldBackoffCustomer(customer.id);
      if (backoff.shouldBackoff) {
        logger.info(`[CRON] Reminder: skip customer=${customer.id} reason=backoff`);
        continue;
      }

      // Try WhatsApp Reminder first
      if (customer.phone && freshBusiness.smsUsedThisMonth < freshBusiness.smsMonthlyLimit) {
        if (!this._isValidE164(customer.phone)) {
          await prisma.smsLog.create({
            data: {
              businessId: business.id,
              customerId: customer.id,
              status: 'FAILED',
              providerResponse: `Invalid phone number: ${customer.phone}`
            }
          });
          logger.error(`[CRON] Reminder: invalid phone business="${freshBusiness.name}" customer=${customer.id} phone=${customer.phone}`);
          continue;
        }

        const template = freshBusiness.templateConfig?.reminderTemplate;
        if (!template || !template.twilioTemplateSid) {
          logger.error(`[CRON] Reminder: No approved WhatsApp reminder template for business="${freshBusiness.name}"`);
          continue;
        }

        const link = `${process.env.APP_URL}/public/feedback/${customer.id}`;
        
        // WhatsApp variables: {{1}} = Name, {{2}} = Business Name, {{3}} = Customer ID
        const variables = {
          "1": customer.name,
          "2": freshBusiness.name,
          "3": customer.id
        };

        const twilioResponse = await twilioService.sendWhatsAppTemplate(
          customer.phone, 
          template.twilioTemplateSid, 
          variables
        );

        if (twilioResponse.success) {
          await prisma.customer.update({ where: { id: customer.id }, data: { reminderCount: { increment: 1 } } });
          await prisma.business.update({ where: { id: business.id }, data: { smsUsedThisMonth: { increment: 1 } } });
          await prisma.smsLog.create({
            data: { businessId: business.id, customerId: customer.id, status: 'SENT', providerResponse: `reminder:whatsapp_tpl:${twilioResponse.sid || ''}`.trim() }
          });
          await this._maybeSendSmsQuotaWarning(business.id);
          continue; // Move to next customer
        } else {
          await prisma.smsLog.create({
            data: {
              businessId: business.id,
              customerId: customer.id,
              status: 'FAILED',
              providerResponse: String(twilioResponse.error || 'Unknown error')
            }
          });
          logger.error(`[CRON] Reminder: WhatsApp Template failed business="${freshBusiness.name}" customer=${customer.id} to=${customer.phone} error=${twilioResponse.error}`);
        }
      }

      // Fallback to Email Reminder
      if (freshBusiness.emailEnabled && customer.email && freshBusiness.emailUsedThisMonth < freshBusiness.emailMonthlyLimit) {
        const link = `${process.env.APP_URL}/public/feedback/${customer.id}`;
        const body = emailService.formatTemplate(freshBusiness.emailReminderTemplate, {
          name: customer.name,
          business_name: freshBusiness.name,
          link
        });

        const sent = await emailService.sendEmail(customer.email, `Reminder: Feedback for ${freshBusiness.name}`, body);
        if (sent) {
          await prisma.customer.update({ where: { id: customer.id }, data: { reminderCount: { increment: 1 } } });
          await prisma.business.update({ where: { id: business.id }, data: { emailUsedThisMonth: { increment: 1 } } });
        } else {
          logger.error(`Failed to send email reminder to ${customer.email}`);
        }
      }
    }
  }

  async runWeeklyAiAnalytics() {
    logger.info('Running Weekly AI Analytics...');
    try {
      const businesses = await prisma.business.findMany({ where: { status: 'ACTIVE' } });
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      for (const business of businesses) {
        const reviews = await prisma.customer.findMany({
          where: {
            businessId: business.id,
            submittedAt: { gte: oneWeekAgo },
            feedback: { not: null }
          },
          select: { feedback: true, rating: true, submittedAt: true }
        });

        const summary = reviews.length > 0 ? await analyzeReviews(reviews, business.name) : null;

        if (summary) {
          await prisma.business.update({
            where: { id: business.id },
            data: {
              lastAiSummary: summary,
              aiSummaryUpdatedAt: new Date()
            }
          });
        }

        const digestAlready = await prisma.auditLog.findFirst({
          where: {
            action: 'WEEKLY_DIGEST_SENT',
            createdAt: { gte: oneWeekAgo },
            details: { path: ['businessId'], equals: business.id }
          }
        });
        if (digestAlready) continue;

        const recipients = await this._getBusinessNotificationEmails(business.id);
        if (!recipients || recipients.length === 0) continue;

        const agg = await prisma.customer.aggregate({
          where: { businessId: business.id, submittedAt: { gte: oneWeekAgo }, rating: { not: null } },
          _count: { id: true },
          _avg: { rating: true }
        });
        const smsSent = await prisma.smsLog.count({
          where: { businessId: business.id, createdAt: { gte: oneWeekAgo } }
        });

        const link = `${process.env.FRONTEND_URL || process.env.APP_URL}/business/dashboard`;
        const aiInsights = summary || 'AI insights are not available right now.';

        await Promise.all(
          recipients.map((to) =>
            emailService.sendTemplate(
              to,
              'weekly_digest',
              'Your Weekly Reputation Report',
              {
                businessName: business.name,
                reviewsCollected: String(agg._count.id || 0),
                avgRating: agg._avg.rating != null ? agg._avg.rating.toFixed(1) : '—',
                smsSent: String(smsSent),
                aiInsights,
                link,
                year: String(new Date().getFullYear())
              }
            )
          )
        );

        await prisma.auditLog.create({
          data: {
            action: 'WEEKLY_DIGEST_SENT',
            userId: null,
            details: { businessId: business.id }
          }
        });
      }
    } catch (error) {
      logger.error('runWeeklyAiAnalytics error:', error);
    }
  }

  async resetMonthlyCounters() {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthEnd = new Date(monthStart.getTime() - 1);
      const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);

      const businesses = await prisma.business.findMany({ where: { status: 'ACTIVE' } });

      await prisma.business.updateMany({
        data: { smsUsedThisMonth: 0, emailUsedThisMonth: 0 }
      });

      for (const business of businesses) {
        const recipients = await this._getBusinessNotificationEmails(business.id);
        if (!recipients || recipients.length === 0) continue;

        const agg = await prisma.customer.aggregate({
          where: { businessId: business.id, submittedAt: { gte: lastMonthStart, lte: lastMonthEnd }, rating: { not: null } },
          _count: { id: true },
          _avg: { rating: true }
        });
        const smsSent = await prisma.smsLog.count({
          where: { businessId: business.id, createdAt: { gte: lastMonthStart, lte: lastMonthEnd } }
        });

        const link = `${process.env.FRONTEND_URL || process.env.APP_URL}/business/dashboard`;
        await Promise.all(
          recipients.map((to) =>
            emailService.sendTemplate(
              to,
              'monthly_reset',
              'Your SMS quota has been reset ✨',
              {
                businessName: business.name,
                lastMonthReviews: String(agg._count.id || 0),
                lastMonthAvgRating: agg._avg.rating != null ? agg._avg.rating.toFixed(1) : '—',
                lastMonthSmsSent: String(smsSent),
                link,
                year: String(new Date().getFullYear())
              }
            )
          )
        );
      }

      logger.info('Monthly counters reset.');
    } catch (error) {
      logger.error('resetMonthlyCounters error:', error);
    }
  }
}

const communicationService = new CommunicationService();
communicationService.lastSuccessfulCronRun = lastSuccessfulCronRun;

module.exports = communicationService;
