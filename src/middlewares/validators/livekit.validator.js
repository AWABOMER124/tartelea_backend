const { z } = require('zod');

const livekitTokenSchema = z.object({
  body: z.object({
    roomName: z.string().min(2),
    role: z.enum(['listener', 'speaker', 'moderator', 'host']).optional(),
  }),
});

module.exports = {
  livekitTokenSchema,
};

