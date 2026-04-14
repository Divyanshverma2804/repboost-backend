const twilio = require('twilio');

class TwilioService {
  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';

    if (this.isProduction) {
      if (
        !process.env.TWILIO_ACCOUNT_SID ||
        !process.env.TWILIO_AUTH_TOKEN ||
        !process.env.TWILIO_PHONE_NUMBER
      ) {
        throw new Error(
          '❌ Twilio credentials missing in PRODUCTION. Refusing to start.'
        );
      }

      this.client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );

      this.fromNumber = process.env.TWILIO_PHONE_NUMBER;

      console.log('✅ Twilio running in PRODUCTION mode');
    } else {
      // Development / staging — all sends are mocked, nothing hits Twilio
      console.log('🚀 Twilio running in MOCK mode (development)');
      this.mock = true;
    }
  }

  async sendSms(to, message) {
    if (this.mock) {
      console.log('📩 MOCK SMS SENT');
      console.log({ to, message });
      return { success: true, sid: 'mock_sms_' + Date.now(), status: 'sent' };
    }

    try {
      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to
      });

      return { success: true, sid: result.sid, status: result.status };
    } catch (error) {
      console.error('❌ Twilio SMS error:', error.message);
      return { success: false, error: error.message };
    }
  }

  async sendWhatsApp(to, message) {
    if (this.mock) {
      console.log('📲 MOCK WHATSAPP SENT');
      console.log({ to, message });
      return { success: true, sid: 'mock_wa_' + Date.now(), status: 'sent' };
    }

    try {
      const result = await this.client.messages.create({
        body: message,
        from: `whatsapp:${this.fromNumber}`,
        to: `whatsapp:${to}`
      });

      return { success: true, sid: result.sid, status: result.status };
    } catch (error) {
      console.error('❌ Twilio WhatsApp error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send a templated WhatsApp message using Twilio Content API
   * @param {string} to - Recipient phone number
   * @param {string} templateSid - Twilio Content Template SID (HX...)
   * @param {Object} variables - Map of template variables { "1": "Name", "2": "Business" }
   */
  async sendWhatsAppTemplate(to, templateSid, variables) {
    if (this.mock) {
      console.log('📲 MOCK WHATSAPP TEMPLATE SENT');
      console.log({ to, templateSid, variables });
      return { success: true, sid: 'mock_wa_tpl_' + Date.now(), status: 'sent' };
    }

    try {
      const result = await this.client.messages.create({
        contentSid: templateSid,
        contentVariables: JSON.stringify(variables),
        from: `whatsapp:${this.fromNumber}`,
        to: `whatsapp:${to}`
      });

      return { success: true, sid: result.sid, status: result.status };
    } catch (error) {
      console.error('❌ Twilio WhatsApp Template error:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new TwilioService();