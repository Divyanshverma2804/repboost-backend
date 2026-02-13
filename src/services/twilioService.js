const twilio = require('twilio');

class TwilioService {
  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';

    // Validate env vars only in production
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
      // Development / staging mock
      console.log('🚀 Twilio running in MOCK mode (development)');
      this.mock = true;
    }
  }

  async sendSMS(to, message) {
    // ✅ MOCK MODE
    if (this.mock) {
      console.log('📩 MOCK SMS SENT');
      console.log({ to, message });

      return {
        success: true,
        sid: 'mock_sms_' + Date.now(),
        status: 'sent'
      };
    }

    // ✅ REAL MODE
    try {
      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to
      });

      return {
        success: true,
        sid: result.sid,
        status: result.status
      };
    } catch (error) {
      console.error('❌ Twilio SMS error:', error.message);

      return {
        success: false,
        error: error.message
      };
    }
  }

  async sendWhatsApp(to, message) {
    if (this.mock) {
      console.log('📲 MOCK WHATSAPP SENT');
      console.log({ to, message });

      return {
        success: true,
        sid: 'mock_wa_' + Date.now(),
        status: 'sent'
      };
    }

    try {
      const toNumber = 
          process.env.NODE_ENV === "production"  ? 
              to  : process.env.WHATSAPP_DEV_OVERRIDE;

      const result = await this.client.messages.create({
        body: message,
        from: `whatsapp:${this.fromNumber}`,
        // to: `whatsapp:${to}`
        to: `whatsapp:${toNumber}`

      });

      return {
        success: true,
        sid: result.sid,
        status: result.status
      };
    } catch (error) {
      console.error('❌ Twilio WhatsApp error:', error.message);

      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new TwilioService();
