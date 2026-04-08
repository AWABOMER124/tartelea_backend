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

 codex/assess-registration-and-login-issues-2y862g

 codex/assess-registration-and-login-issues-1jnr5s

 codex/assess-registration-and-login-issues-v0dk1t
 main
const leaveAudioRoomSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

const roomTokenSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

module.exports = {
  createAudioRoomSchema,
  joinAudioRoomSchema,
  leaveAudioRoomSchema,
  roomTokenSchema,
};
 codex/assess-registration-and-login-issues-2y862g

 codex/assess-registration-and-login-issues-1jnr5s


module.exports = {
  createAudioRoomSchema,
  joinAudioRoomSchema,
};

 main
