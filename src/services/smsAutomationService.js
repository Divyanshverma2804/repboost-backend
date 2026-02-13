const prisma = require('../config/database');
const twilioService = require('./twilioService');

class SmsAutomationService {
  /**
   * Process pending SMS sends with quota protection and rate limiting
   */
  async processPendingSends() {
    console.log('🔄 Processing pending SMS sends...');

    try {
      // Get all active businesses
      const activeBusinesses = await prisma.business.findMany({
        where: { status: 'ACTIVE' }
      });

      for (const business of activeBusinesses) {
        await this.processBusiness(business);
      }

      console.log('✅ SMS processing completed');
    } catch (error) {
      console.error('❌ SMS processing error:', error);
    }
  }

  /**
   * Process SMS sends for a specific business
   */
  async processBusiness(business) {
    // Find patients ready for SMS
    const patients = await prisma.patient.findMany({
      where: {
        businessId: business.id,
        phone: { not: null },
        sentAt: null,
        sendAt: { lte: new Date() }
      },
      take: business.rateLimitPerMinute
    });

    if (patients.length === 0) return;

    console.log(`📱 Processing ${patients.length} patients for ${business.name}`);

    for (const patient of patients) {
      await this.sendReviewRequest(business, patient);
      
      // Rate limiting delay (distribute sends over 1 minute)
      if (patients.length > 1) {
        const delayMs = (60 * 1000) / business.rateLimitPerMinute;
        await this.sleep(delayMs);
      }
    }
  }

  /**
   * Send review request SMS with quota check
   */
  async sendReviewRequest(business, patient) {
    // Check quota
    if (business.smsUsedThisMonth >= business.smsMonthlyLimit) {
      console.log(`⚠️  Quota exceeded for ${business.name}`);
      
      await prisma.smsLog.create({
        data: {
          businessId: business.id,
          patientId: patient.id,
          status: 'QUOTA_BLOCKED',
          providerResponse: `Monthly limit of ${business.smsMonthlyLimit} reached`
        }
      });
      
      return;
    }

    // Generate review link
    const reviewLink = `${process.env.APP_URL}/public/feedback/${patient.id}`;

    // Prepare message
    const message = business.messageTemplate
      .replace(/\{\{name\}\}/g, patient.name)
      .replace(/\{\{business_name\}\}/g, business.name)
      .replace(/\{\{link\}\}/g, reviewLink);

    // Send whatsappSMS ##updated this recent 
    const result = await twilioService.sendWhatsApp(patient.phone, message);

    if (result.success) {
      // Update patient and business
      await prisma.$transaction([
        prisma.patient.update({
          where: { id: patient.id },
          data: { sentAt: new Date() }
        }),
        prisma.business.update({
          where: { id: business.id },
          data: { smsUsedThisMonth: { increment: 1 } }
        }),
        prisma.smsLog.create({
          data: {
            businessId: business.id,
            patientId: patient.id,
            status: 'SENT',
            providerResponse: JSON.stringify(result)
          }
        })
      ]);

      console.log(`✅ SMS sent to ${patient.name} (${patient.phone})`);
    } else {
      // Log failure
      await prisma.smsLog.create({
        data: {
          businessId: business.id,
          patientId: patient.id,
          status: 'FAILED',
          providerResponse: result.error
        }
      });

      console.log(`❌ SMS failed for ${patient.name}: ${result.error}`);
    }
  }

  /**
   * Process reminder SMS
   */
  async processReminders() {
    console.log('🔔 Processing reminders...');

    try {
      const activeBusinesses = await prisma.business.findMany({
        where: { status: 'ACTIVE' }
      });

      for (const business of activeBusinesses) {
        await this.processBusinessReminders(business);
      }

      console.log('✅ Reminder processing completed');
    } catch (error) {
      console.error('❌ Reminder processing error:', error);
    }
  }

  /**
   * Process reminders for a specific business
   */
  async processBusinessReminders(business) {
    const reminderCutoff = new Date();
    reminderCutoff.setHours(reminderCutoff.getHours() - business.reminderDelayHours);

    const patients = await prisma.patient.findMany({
      where: {
        businessId: business.id,
        sentAt: { not: null, lte: reminderCutoff },
        submittedAt: null,
        reminderCount: { lt: business.maxReminders },
        phone: { not: null }
      },
      take: business.rateLimitPerMinute
    });

    if (patients.length === 0) return;

    console.log(`🔔 Processing ${patients.length} reminders for ${business.name}`);

    for (const patient of patients) {
      await this.sendReminder(business, patient);
      
      if (patients.length > 1) {
        const delayMs = (60 * 1000) / business.rateLimitPerMinute;
        await this.sleep(delayMs);
      }
    }
  }

  /**
   * Send reminder SMS
   */
  async sendReminder(business, patient) {
    // Check quota
    if (business.smsUsedThisMonth >= business.smsMonthlyLimit) {
      await prisma.smsLog.create({
        data: {
          businessId: business.id,
          patientId: patient.id,
          status: 'QUOTA_BLOCKED',
          providerResponse: 'Reminder blocked - monthly quota exceeded'
        }
      });
      return;
    }

    const reviewLink = `${process.env.APP_URL}/b/${business.slug}/feedback/${patient.id}`;

    const message = business.reminderTemplate
      .replace(/\{\{name\}\}/g, patient.name)
      .replace(/\{\{business_name\}\}/g, business.name)
      .replace(/\{\{link\}\}/g, reviewLink);

    const result = await twilioService.sendWhatsApp(patient.phone, message);

    if (result.success) {
      await prisma.$transaction([
        prisma.patient.update({
          where: { id: patient.id },
          data: { reminderCount: { increment: 1 } }
        }),
        prisma.business.update({
          where: { id: business.id },
          data: { smsUsedThisMonth: { increment: 1 } }
        }),
        prisma.smsLog.create({
          data: {
            businessId: business.id,
            patientId: patient.id,
            status: 'SENT',
            providerResponse: `Reminder ${patient.reminderCount + 1}: ${JSON.stringify(result)}`
          }
        })
      ]);

      console.log(`✅ Reminder sent to ${patient.name}`);
    } else {
      await prisma.smsLog.create({
        data: {
          businessId: business.id,
          patientId: patient.id,
          status: 'FAILED',
          providerResponse: `Reminder failed: ${result.error}`
        }
      });
    }
  }

  /**
   * Reset monthly SMS counters
   */
  async resetMonthlyCounters() {
    console.log('🔄 Resetting monthly SMS counters...');

    try {
      await prisma.business.updateMany({
        data: { smsUsedThisMonth: 0 }
      });

      console.log('✅ Monthly counters reset');
    } catch (error) {
      console.error('❌ Counter reset error:', error);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new SmsAutomationService();
