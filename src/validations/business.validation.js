const { z } = require('zod');

// Zod v4 compatible helper: coerce empty string → null, then validate as URL or null
const optionalUrl = () =>
  z.preprocess(
    (val) => (val === '' ? null : val),
    z.string().url().nullable().optional()
  );

// Zod v4 compatible helper: coerce empty string → null for optional text fields
const optionalStr = (maxLen = 1000) =>
  z.preprocess(
    (val) => (val === '' ? null : val),
    z.string().max(maxLen).nullable().optional()
  );

const updateBusinessSettingsSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  reviewLink: z.string().url().optional(),
  placeId: optionalStr(100),
  logoUrl: optionalUrl(),

  messageTemplate: z.string().max(1000).optional(),
  reminderTemplate: z.string().max(1000).optional(),

  sendDelayHours: z.number().int().min(0).max(168).optional(),
  reminderDelayHours: z.number().int().min(0).max(168).optional(),
  maxReminders: z.number().int().min(0).max(5).optional(),

  // Business Page fields
  tagline: optionalStr(200),
  description: optionalStr(2000),
  highlights: optionalStr(5000),   // JSON string of string[]
  phone: optionalStr(30),
  address: optionalStr(300),
  mapsLink: optionalUrl(),
  heroBannerUrl: optionalUrl(),
  primaryColor: z.preprocess(
    (val) => (val === '' ? null : val),
    z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional()
  ),

  // AI settings
  autoReplyEnabled: z.boolean().optional(),
  autoReplyMinRating: z.number().int().min(1).max(5).optional(),

  // Email settings
  emailEnabled: z.boolean().optional(),
  emailTemplate: z.string().max(2000).optional(),
  emailReminderTemplate: z.string().max(2000).optional(),

  // Referral settings
  referralEnabled: z.boolean().optional(),
  referralOffer: z.string().max(500).optional(),
  referralMessageTemplate: z.string().max(1000).optional(),

  // Wall of Love settings
  wallOfLoveEnabled: z.boolean().optional(),
  wallOfLoveTitle: z.string().max(100).optional(),
  wallOfLoveDescription: optionalStr(500),

  // Notification settings
  notifyOnNegativeReview: z.boolean().optional(),
  negativeReviewThreshold: z.number().int().min(1).max(5).optional(),
  notificationEmails: optionalStr(500),
});

module.exports = {
  updateBusinessSettingsSchema,
};
