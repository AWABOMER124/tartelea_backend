const { z } = require('zod');

const createAudioRoomSchema = z.object({
  body: z.object({
    title: z.string().min(3),
    description: z.string().optional(),
  }),
});

const joinAudioRoomSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    role: z.enum(['listener', 'speaker', 'moderator', 'host']).optional(),
  }),
});

module.exports = {
  createAudioRoomSchema,
  joinAudioRoomSchema,
};

