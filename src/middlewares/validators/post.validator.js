const { z } = require('zod');

const createPostSchema = z.object({
  body: z.object({
    title: z.string().min(5).max(100),
    body: z.string().min(10),
    category: z.string().optional(),
    image_url: z.string().url().optional().or(z.literal('')),
  }),
});

const postCommentSchema = z.object({
  body: z.object({
    content: z.string().min(1).max(500),
  }),
});

module.exports = {
  createPostSchema,
  postCommentSchema,
};
