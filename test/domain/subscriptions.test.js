const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAccessDecisions,
  buildSubscriptionContract,
  canAccessCourse,
  getRoleEntitlements,
} = require('../../src/domain/subscriptions');

test('free member access is limited to public library and rooms', () => {
  const entitlements = ['access_public_community', 'access_free_library', 'access_public_rooms'];
  const access = buildAccessDecisions({
    roles: ['member'],
    entitlements,
    scopedCourseIds: [],
  });

  assert.equal(access.canAccessLibrary, true);
  assert.equal(access.canAccessFullLibrary, false);
  assert.equal(access.canJoinRoom, true);
  assert.equal(access.canJoinPremiumRoom, false);
  assert.equal(access.canCreateRoom, false);
  assert.equal(access.canGetDiscount, false);
});

test('trainer override grants premium room and hosting access without discount', () => {
  const entitlements = getRoleEntitlements(['trainer']);
  const access = buildAccessDecisions({
    roles: ['trainer'],
    entitlements,
    scopedCourseIds: [],
  });

  assert.equal(access.canAccessFullLibrary, true);
  assert.equal(access.canJoinPremiumRoom, true);
  assert.equal(access.canCreateRoom, true);
  assert.equal(access.canHostSessions, true);
  assert.equal(access.canGetDiscount, false);
});

test('student scoped access only unlocks the subscribed course', () => {
  const snapshot = {
    access: {
      canAccessFullLibrary: false,
      hasAdminPlatform: false,
    },
    scoped_course_ids: ['course-1'],
  };

  assert.equal(canAccessCourse(snapshot, 'course-1'), true);
  assert.equal(canAccessCourse(snapshot, 'course-2'), false);
});

test('subscription contract includes current period and access projection', () => {
  const contract = buildSubscriptionContract({
    primary_plan_code: 'monthly',
    primary_source: 'future_payment',
    primary_subscription: {
      starts_at: '2026-04-01T00:00:00.000Z',
      ends_at: '2026-05-01T00:00:00.000Z',
    },
    subscriptions: [],
    status: 'active',
    entitlements: ['access_full_library', 'access_all_rooms'],
    scoped_course_ids: [],
    roles: ['member'],
    access: {
      canAccessLibrary: true,
      canAccessFullLibrary: true,
      canJoinRoom: true,
      canJoinPremiumRoom: true,
      canCreateRoom: true,
      canAskQuestion: true,
      canGetDiscount: true,
    },
  });

  assert.equal(contract.plan, 'monthly');
  assert.equal(contract.status, 'active');
  assert.equal(contract.starts_at, '2026-04-01T00:00:00.000Z');
  assert.equal(contract.ends_at, '2026-05-01T00:00:00.000Z');
  assert.deepEqual(contract.entitlements, ['access_full_library', 'access_all_rooms']);
  assert.equal(contract.access.canJoinPremiumRoom, true);
  assert.equal(contract.discounts.courses_percent, 25);
});
