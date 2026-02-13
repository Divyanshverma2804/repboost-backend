const { z } = require('zod');

const updateBusinessSettingsSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  reviewLink: z.string().url().optional(),
  logoUrl: z.string().url().nullable().optional(),

  messageTemplate: z.string().max(1000).optional(),
  reminderTemplate: z.string().max(1000).optional(),

  sendDelayHours: z.number().int().min(0).max(168).optional(),
  reminderDelayHours: z.number().int().min(0).max(168).optional(),
  maxReminders: z.number().int().min(0).max(5).optional(),
});

module.exports = {
  updateBusinessSettingsSchema,
};
