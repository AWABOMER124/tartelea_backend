const ENTITLEMENT_CODES = [
  'access_public_community',
  'access_free_library',
  'access_full_library',
  'access_public_rooms',
  'access_all_rooms',
  'create_rooms',
  'access_specific_course',
  'discount_courses_25',
  'host_sessions',
  'admin_platform',
];

const PLAN_CODES = ['free', 'monthly', 'student'];
const BILLING_PERIODS = ['none', 'monthly', 'scoped'];
const SUBSCRIPTION_STATUSES = ['active', 'expired', 'canceled'];
const SUBSCRIPTION_SOURCES = ['manual', 'future_payment'];
const OVERRIDE_EFFECTS = ['grant', 'revoke'];
const ACCESS_TIERS = ['free', 'full', 'course'];
const FUTURE_PAYMENT_PROVIDERS = ['stripe', 'app_store', 'google_play'];

const PLAN_PRIORITY = {
  free: 0,
  student: 1,
  monthly: 2,
};

const PLAN_SEEDS = [
  {
    code: 'free',
    name: 'Free',
    billing_period: 'none',
    price: 0,
    currency: 'USD',
    is_active: true,
    entitlements: [
      'access_public_community',
      'access_free_library',
      'access_public_rooms',
    ],
  },
  {
    code: 'monthly',
    name: 'Monthly',
    billing_period: 'monthly',
    price: 29,
    currency: 'USD',
    is_active: true,
    entitlements: [
      'access_public_community',
      'access_free_library',
      'access_full_library',
      'access_all_rooms',
      'create_rooms',
      'discount_courses_25',
    ],
  },
  {
    code: 'student',
    name: 'Student',
    billing_period: 'scoped',
    price: 0,
    currency: 'USD',
    is_active: true,
    entitlements: [
      'access_free_library',
      'access_specific_course',
    ],
  },
];

const ENTITLEMENT_SEEDS = [
  {
    code: 'access_public_community',
    description: 'Allows community participation in standard public/member areas.',
  },
  {
    code: 'access_free_library',
    description: 'Allows access to the free library catalog.',
  },
  {
    code: 'access_full_library',
    description: 'Allows access to the premium/full library catalog.',
  },
  {
    code: 'access_public_rooms',
    description: 'Allows joining standard public audio rooms.',
  },
  {
    code: 'access_all_rooms',
    description: 'Allows joining all room tiers, including premium rooms.',
  },
  {
    code: 'create_rooms',
    description: 'Allows creating community audio rooms.',
  },
  {
    code: 'access_specific_course',
    description: 'Allows access to a specific course scope carried in metadata.course_id.',
  },
  {
    code: 'discount_courses_25',
    description: 'Allows a 25% discount on eligible course prices.',
  },
  {
    code: 'host_sessions',
    description: 'Allows hosting and managing official live sessions.',
  },
  {
    code: 'admin_platform',
    description: 'Bypass entitlement gates across the platform.',
  },
];

const TRAINER_ROLE_ENTITLEMENTS = [
  'access_full_library',
  'access_all_rooms',
  'create_rooms',
  'host_sessions',
];

function toSortedUnique(values = []) {
  return [...new Set((values || []).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function hasRole(roles = [], role) {
  return Array.isArray(roles) && roles.includes(role);
}

function getPrimaryPlanCode(subscriptions = []) {
  const activeCodes = subscriptions
    .filter((subscription) => subscription.status === 'active')
    .map((subscription) => subscription.plan_code)
    .filter((planCode) => PLAN_CODES.includes(planCode));

  if (activeCodes.length === 0) {
    return 'free';
  }

  return activeCodes.sort((left, right) => (PLAN_PRIORITY[right] || 0) - (PLAN_PRIORITY[left] || 0))[0];
}

function getScopedCourseIds(subscriptions = [], overrideScopes = []) {
  const courseIds = [];

  for (const subscription of subscriptions) {
    if (subscription.plan_code !== 'student') {
      continue;
    }

    const courseId = subscription.metadata?.course_id || subscription.metadata?.courseId || null;
    if (courseId) {
      courseIds.push(courseId);
    }
  }

  for (const courseId of overrideScopes || []) {
    if (courseId) {
      courseIds.push(courseId);
    }
  }

  return toSortedUnique(courseIds);
}

function getRoleEntitlements(roles = []) {
  const entitlements = [];

  if (hasRole(roles, 'trainer')) {
    entitlements.push(...TRAINER_ROLE_ENTITLEMENTS);
  }

  if (hasRole(roles, 'admin')) {
    entitlements.push(...ENTITLEMENT_CODES);
  }

  return toSortedUnique(entitlements);
}

function mergeEntitlements({
  planEntitlements = [],
  roleEntitlements = [],
  overrideGrants = [],
  overrideRevokes = [],
  roles = [],
}) {
  const merged = new Set([
    ...planEntitlements,
    ...roleEntitlements,
    ...overrideGrants,
  ]);

  for (const entitlement of overrideRevokes || []) {
    merged.delete(entitlement);
  }

  if (hasRole(roles, 'admin')) {
    for (const entitlement of ENTITLEMENT_CODES) {
      merged.add(entitlement);
    }
  }

  return toSortedUnique([...merged]);
}

function buildAccessDecisions({
  roles = [],
  entitlements = [],
  scopedCourseIds = [],
}) {
  const entitlementSet = new Set(entitlements);
  const isAdmin = hasRole(roles, 'admin');
  const isModerator = hasRole(roles, 'moderator');

  const canAccessLibrary =
    isAdmin ||
    entitlementSet.has('access_free_library') ||
    entitlementSet.has('access_full_library') ||
    scopedCourseIds.length > 0;

  const canAccessFullLibrary = isAdmin || entitlementSet.has('access_full_library');
  const canJoinRoom =
    isAdmin ||
    isModerator ||
    entitlementSet.has('access_public_rooms') ||
    entitlementSet.has('access_all_rooms');
  const canJoinPremiumRoom =
    isAdmin ||
    isModerator ||
    entitlementSet.has('access_all_rooms');
  const canCreateRoom =
    isAdmin ||
    isModerator ||
    entitlementSet.has('create_rooms');
  const canAskQuestion =
    isAdmin ||
    isModerator ||
    entitlementSet.has('access_public_community') ||
    entitlementSet.has('access_all_rooms') ||
    entitlementSet.has('host_sessions');
  const canGetDiscount =
    isAdmin ||
    entitlementSet.has('discount_courses_25');
  const canHostSessions =
    isAdmin ||
    isModerator ||
    entitlementSet.has('host_sessions') ||
    entitlementSet.has('create_rooms');
  const hasAdminPlatform = isAdmin || entitlementSet.has('admin_platform');

  return {
    canAccessLibrary,
    canAccessFullLibrary,
    canJoinRoom,
    canJoinPremiumRoom,
    canCreateRoom,
    canAskQuestion,
    canGetDiscount,
    canHostSessions,
    hasAdminPlatform,
  };
}

function canAccessCourse(snapshot, courseId) {
  if (!courseId) {
    return false;
  }

  if (snapshot?.access?.hasAdminPlatform || snapshot?.access?.canAccessFullLibrary) {
    return true;
  }

  return (snapshot?.scoped_course_ids || []).includes(courseId);
}

function getCourseDiscountPercent(snapshot) {
  return snapshot?.access?.canGetDiscount ? 25 : 0;
}

function buildSubscriptionContract(snapshot) {
  const primarySubscription =
    snapshot.primary_subscription ||
    snapshot.subscriptions?.find((subscription) => subscription.plan_code === snapshot.primary_plan_code) ||
    null;

  return {
    plan: snapshot.primary_plan_code,
    status: snapshot.status,
    starts_at: primarySubscription?.starts_at || null,
    ends_at: primarySubscription?.ends_at || null,
    entitlements: snapshot.entitlements,
    scoped_course_ids: snapshot.scoped_course_ids,
    access: {
      canAccessLibrary: snapshot.access.canAccessLibrary,
      canAccessFullLibrary: snapshot.access.canAccessFullLibrary,
      canJoinRoom: snapshot.access.canJoinRoom,
      canJoinPremiumRoom: snapshot.access.canJoinPremiumRoom,
      canCreateRoom: snapshot.access.canCreateRoom,
      canAskQuestion: snapshot.access.canAskQuestion,
      canGetDiscount: snapshot.access.canGetDiscount,
    },
    discounts: {
      courses_percent: getCourseDiscountPercent(snapshot),
    },
    role_overrides: {
      trainer: hasRole(snapshot.roles, 'trainer'),
      admin: hasRole(snapshot.roles, 'admin'),
    },
    payment: {
      supported_providers: FUTURE_PAYMENT_PROVIDERS,
      source: snapshot.primary_source,
    },
  };
}

module.exports = {
  ACCESS_TIERS,
  BILLING_PERIODS,
  ENTITLEMENT_CODES,
  ENTITLEMENT_SEEDS,
  FUTURE_PAYMENT_PROVIDERS,
  OVERRIDE_EFFECTS,
  PLAN_CODES,
  PLAN_PRIORITY,
  PLAN_SEEDS,
  SUBSCRIPTION_SOURCES,
  SUBSCRIPTION_STATUSES,
  TRAINER_ROLE_ENTITLEMENTS,
  buildAccessDecisions,
  buildSubscriptionContract,
  canAccessCourse,
  getPrimaryPlanCode,
  getRoleEntitlements,
  getScopedCourseIds,
  mergeEntitlements,
  toSortedUnique,
};
