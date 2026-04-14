const rateLimit = require('express-rate-limit');

/**
 * Standard rate limiter for auth routes
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs for auth routes
  message: { error: 'Too many attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Stricter rate limiter for sensitive actions like forgot-password
 */
const sensitiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 requests per hour
  message: { error: 'Too many attempts, please try again after an hour' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for OTP sending to prevent abuse
 */
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 3, // Limit each IP to 3 OTP requests per 10 minutes
  message: { error: 'Too many OTP requests, please try again after 10 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for team invites
 */
const inviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 invites per hour
  message: { error: 'Too many invite requests, please try again after an hour' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for AI feedback improvements (per session)
 */
const aiImproveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Max 3 improvements per session window
  message: { error: 'Too many AI improvements for this session. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const sessionId = req.body && typeof req.body.sessionId === 'string' ? req.body.sessionId : null;
    return sessionId ? `${req.ip}:${sessionId}` : req.ip;
  }
});

module.exports = {
  authLimiter,
  sensitiveLimiter,
  otpLimiter,
  inviteLimiter,
  aiImproveLimiter
};
