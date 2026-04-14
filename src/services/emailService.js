const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

class EmailService {
  constructor() {
    this.transporter = null;
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    if (user && pass) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: user,
          pass: pass,
        },
      });
    }
  }

  /**
   * Send an email using Nodemailer
   * @param {string} to - Recipient email
   * @param {string} subject - Email subject
   * @param {string} text - Plain text content
   * @param {string} html - HTML content (optional)
   * @returns {Promise<boolean>} - Success status
   */
  async sendEmail(to, subject, text, html = null) {
    if (!this.transporter) {
      logger.warn('Email service not configured (EMAIL_USER/EMAIL_PASS missing). Skipping email send.');
      return false;
    }

    const msg = {
      to,
      from: process.env.EMAIL_USER,
      subject,
      text,
      html: html || text,
    };

    try {
      await this.transporter.sendMail(msg);
      logger.info(`Email sent successfully to ${to}`);
      return true;
    } catch (error) {
      logger.error('Nodemailer error:', error);
      return false;
    }
  }

  loadHtmlTemplate(templateName) {
    const filePath = path.join(__dirname, '..', 'templates', 'emails', `${templateName}.html`);
    return fs.readFileSync(filePath, 'utf8');
  }

  renderHtmlTemplate(templateName, variables) {
    const html = this.loadHtmlTemplate(templateName);
    return this.formatTemplate(html, variables || {});
  }

  renderSubject(subjectTemplate, variables) {
    return this.formatTemplate(subjectTemplate, variables || {});
  }

  async sendTemplate(to, templateName, subjectTemplate, variables) {
    const subject = this.renderSubject(subjectTemplate, variables);
    const html = this.renderHtmlTemplate(templateName, variables);
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return this.sendEmail(to, subject, text, html);
  }

  /**
   * Format a template with variables
   * @param {string} template - The template string
   * @param {object} variables - Variables to replace (e.g. { name: 'John' })
   * @returns {string} - Formatted string
   */
  formatTemplate(template, variables) {
    let formatted = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      formatted = formatted.replace(regex, value || '');
    }
    return formatted;
  }
}

module.exports = new EmailService();
