const test = require('node:test');
const assert = require('node:assert/strict');
const { livekitTokenSchema } = require('../../src/middlewares/validators/livekit.validator');

test('livekitTokenSchema accepts valid token request payload', () => {
  const parsed = livekitTokenSchema.parse({
    body: {
      roomName: 'room-1',
      role: 'speaker',
    },
  });
  assert.equal(parsed.body.role, 'speaker');
});

test('livekitTokenSchema rejects unsupported role', () => {
  assert.throws(() => {
    livekitTokenSchema.parse({
      body: {
        roomName: 'room-1',
        role: 'owner',
      },
    });
  });
});

test('livekitTokenSchema rejects missing roomName', () => {
  assert.throws(() => {
    livekitTokenSchema.parse({
      body: { role: 'listener' },
    });
  });
});

