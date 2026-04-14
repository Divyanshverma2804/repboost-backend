const prisma = require('../config/database');
const emailService = require('./emailService');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

class AuthService {
  async createPasswordSetupToken(email, businessId, expiresMs) {
    const resetToken = crypto.randomBytes(32).toString('hex');
    const passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const passwordResetExpires = new Date(Date.now() + expiresMs);

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        ...(businessId ? { businessId } : {}),
        passwordResetToken,
        passwordResetExpires,
      },
      create: {
        email,
        ...(businessId ? { businessId } : {}),
        role: businessId ? 'BUSINESS_ADMIN' : 'BUSINESS_MEMBER',
        passwordResetToken,
        passwordResetExpires,
      },
    });

    return { user, resetToken };
  }

  /**
   * Initiate password reset for a user
   * @param {string} email - The user's email
   * @returns {Promise<boolean>} - Success status
   */
  async forgotPassword(email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error('User not found');

    const resetToken = crypto.randomBytes(32).toString('hex');
    const passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { email },
      data: { passwordResetToken, passwordResetExpires },
    });

    const resetUrl = `${process.env.APP_URL}/reset-password/${resetToken}`;
    return emailService.sendTemplate(
      email,
      'password_reset',
      'Reset Your Rewple Password',
      { link: resetUrl, expiresIn: '1 hour', year: String(new Date().getFullYear()) }
    );
  }

  /**
   * Reset user's password using a token
   * @param {string} token - The password reset token
   * @param {string} password - The new password
   * @returns {Promise<User>} - The updated user
   */
  async resetPassword(token, password) {
    const passwordResetToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken,
        passwordResetExpires: { gt: new Date() },
      },
    });

    if (!user) throw new Error('Password reset token is invalid or has expired');

    const passwordHash = await bcrypt.hash(password, 10);

    return prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });
  }

  /**
   * Initiate the onboarding for a new business owner
   * @param {string} email - The new business owner's email
   * @param {string} businessId - The ID of the new business
   * @returns {Promise<{user: User, resetToken: string}>}
   */
  async initiateBusinessOnboarding(email, businessId) {
    return this.createPasswordSetupToken(email, businessId, 7 * 24 * 60 * 60 * 1000);
  }
}

module.exports = new AuthService();
