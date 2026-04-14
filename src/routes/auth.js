const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticate } = require('../middleware/auth');
const { sensitiveLimiter, otpLimiter } = require('../middleware/rateLimiter');
const authService = require('../services/authService');
const auditLogService = require('../services/auditLogService');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, businessId: user.businessId },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    await auditLogService.log('USER_LOGIN', user.id);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });

    res.json({ message: 'Logged in successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User data missing in request' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, role: true, businessId: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Fetch me error:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', sensitiveLimiter, async (req, res) => {
  try {
    await authService.forgotPassword(req.body.email);
    res.json({ message: 'Password reset link sent' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send reset link' });
  }
});

// POST /api/auth/otp/send
router.post('/otp/send', otpLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await prisma.user.update({
      where: { email },
      data: {
        otpSecret: otp, // Using otpSecret to store the actual OTP for now
        passwordResetExpires: otpExpiry // Reusing this field for OTP expiry
      }
    });

    const emailService = require('../services/emailService');
    await emailService.sendTemplate(
      email,
      'otp_login',
      'Your Rewple Login OTP',
      { otp, expiresIn: '5 minutes', year: String(new Date().getFullYear()) }
    );

    res.json({ message: 'OTP sent successfully' });
  } catch (error) {
    console.error('OTP Send error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// POST /api/auth/otp/verify
router.post('/otp/verify', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || user.otpSecret !== otp || user.passwordResetExpires < new Date()) {
      return res.status(401).json({ error: 'Invalid or expired OTP' });
    }

    // Clear OTP after successful verification
    await prisma.user.update({
      where: { email },
      data: { otpSecret: null, passwordResetExpires: null }
    });

    const token = jwt.sign(
      { id: user.id, role: user.role, businessId: user.businessId },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    await auditLogService.log('USER_LOGIN_OTP', user.id);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });

    res.json({ message: 'Logged in successfully' });
  } catch (error) {
    res.status(500).json({ error: 'OTP verification failed' });
  }
});

// POST /api/auth/reset-password/:token
router.post('/reset-password/:token', async (req, res) => {
  try {
    const user = await authService.resetPassword(req.params.token, req.body.password);
    await auditLogService.log('PASSWORD_RESET', user.id);
    res.json({ message: 'Password has been reset' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/auth/set-password/:token
router.post('/set-password/:token', async (req, res) => {
  try {
    const user = await authService.resetPassword(req.params.token, req.body.password);
    await auditLogService.log('USER_ONBOARDED', user.id);
    res.json({ message: 'Password has been set successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
