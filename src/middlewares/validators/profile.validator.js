const { z } = require('zod');

const updateProfileSchema = z.object({
  body: z.object({
    full_name: z.string().min(2).optional(),
    bio: z.string().max(500).optional(),
    specialties: z.array(z.string()).optional(),
    services: z.array(z.string()).optional(),
    facebook_url: z.string().url().optional().or(z.literal('')),
    tiktok_url: z.string().url().optional().or(z.literal('')),
    instagram_url: z.string().url().optional().or(z.literal('')),
    country: z.string().optional(),
  }),
});

module.exports = {
  updateProfileSchema,
};
