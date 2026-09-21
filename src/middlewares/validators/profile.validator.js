const { z } = require('zod');

const updateProfileSchema = z.object({
  body: z.object({
    full_name: z.string().min(2).optional(),
    bio: z.string().max(500).optional(),
    specialties: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    specializations: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    services: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
    experience_years: z.number().int().min(0).max(80).optional(),
    avatar_url: z.string().url().optional().or(z.literal('')),
    facebook_url: z.string().url().optional().or(z.literal('')),
    tiktok_url: z.string().url().optional().or(z.literal('')),
    instagram_url: z.string().url().optional().or(z.literal('')),
    country: z.string().trim().max(100).optional(),
  }),
});

module.exports = {
  updateProfileSchema,
};
