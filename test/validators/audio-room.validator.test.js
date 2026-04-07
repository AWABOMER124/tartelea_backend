const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createAudioRoomSchema,
  joinAudioRoomSchema,
  leaveAudioRoomSchema,
  roomTokenSchema,
} = require('../../src/middlewares/validators/audio-room.validator');

test('createAudioRoomSchema accepts valid payload', () => {
  const parsed = createAudioRoomSchema.parse({
    body: { title: 'Weekly Room', description: 'community discussion' },
  });
  assert.equal(parsed.body.title, 'Weekly Room');
});

test('createAudioRoomSchema rejects short title', () => {
  assert.throws(() => {
    createAudioRoomSchema.parse({ body: { title: 'ab' } });
  });
});

test('joinAudioRoomSchema accepts valid UUID and role', () => {
  const parsed = joinAudioRoomSchema.parse({
    params: { id: '11111111-1111-4111-8111-111111111111' },
    body: { role: 'listener' },
  });
  assert.equal(parsed.body.role, 'listener');
});

test('leaveAudioRoomSchema rejects invalid UUID', () => {
  assert.throws(() => {
    leaveAudioRoomSchema.parse({
      params: { id: 'not-a-uuid' },
    });
  });
});

test('roomTokenSchema accepts valid UUID', () => {
  const parsed = roomTokenSchema.parse({
    params: { id: '22222222-2222-4222-8222-222222222222' },
  });
  assert.equal(parsed.params.id, '22222222-2222-4222-8222-222222222222');
});

