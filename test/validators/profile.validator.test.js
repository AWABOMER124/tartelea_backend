const test = require('node:test');
const assert = require('node:assert/strict');
const { updateProfileSchema } = require('../../src/middlewares/validators/profile.validator');

test('updateProfileSchema accepts trainer profile fields', () => {
  const parsed = updateProfileSchema.parse({
    body: {
      full_name: 'Trainer Name',
      bio: 'نبذة',
      country: 'SA',
      experience_years: 10,
      specializations: ['تدبر', 'لغة'],
      avatar_url: 'https://example.com/avatar.jpg',
    },
  });

  assert.equal(parsed.body.experience_years, 10);
  assert.deepEqual(parsed.body.specializations, ['تدبر', 'لغة']);
});

test('updateProfileSchema rejects unreasonable trainer experience', () => {
  assert.throws(() => {
    updateProfileSchema.parse({
      body: { experience_years: 120 },
    });
  });
});

test('updateProfileSchema rejects oversized specialization lists', () => {
  assert.throws(() => {
    updateProfileSchema.parse({
      body: { specializations: Array.from({ length: 21 }, (_, i) => `spec-${i}`) },
    });
  });
});
