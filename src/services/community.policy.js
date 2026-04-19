const { getPrimaryRole, normalizeRoles } = require('../middlewares/rbac.middleware');
const { canAccessCourse } = require('../domain/subscriptions');

const PRIVILEGED_ROLES = new Set(['admin', 'moderator']);
const AUTHENTICATED_VISIBILITIES = new Set([
  'authenticated',
  'members_only',
  'premium_only',
  'program_enrolled',
  'track_enrolled',
  'session_registered',
]);

function normalizeUser(user) {
  if (!user) {
    return null;
  }

  const roles = normalizeRoles(user.roles || (user.role ? [user.role] : []), {
    fallback: 'member',
  });

  return {
    ...user,
    roles,
    role: getPrimaryRole(roles, { fallback: 'member' }),
  };
}

function hasPrivilegedRole(user) {
  return !!user?.roles?.some((role) => PRIVILEGED_ROLES.has(role));
}

function hasAllowedRoles(context, user) {
  const allowedRoles = Array.isArray(context?.membership_rule?.allowed_roles)
    ? context.membership_rule.allowed_roles
    : [];

  if (allowedRoles.length === 0) {
    return true;
  }

  if (!user) {
    return false;
  }

  const normalizedAllowedRoles = normalizeRoles(allowedRoles);
  return user.roles.some((role) => normalizedAllowedRoles.includes(role));
}

function hasEntitlement(snapshot, entitlementCode) {
  return Boolean(snapshot?.entitlements?.includes(entitlementCode) || snapshot?.access?.hasAdminPlatform);
}

function resolveContextCourseId(context) {
  return context?.metadata?.course_id || context?.metadata?.courseId || (context?.context_type === 'course' ? context?.source_id : null);
}

function isPremiumContextReadable(context, user, subscriptionSnapshot) {
  if (hasPrivilegedRole(user)) {
    return true;
  }

  const requiredEntitlement = context?.metadata?.required_entitlement || context?.metadata?.requiredEntitlement || null;
  if (requiredEntitlement) {
    return hasEntitlement(subscriptionSnapshot, requiredEntitlement);
  }

  const courseId = resolveContextCourseId(context);
  if (courseId) {
    return canAccessCourse(subscriptionSnapshot, courseId);
  }

  return Boolean(
    subscriptionSnapshot?.access?.canJoinPremiumRoom ||
    subscriptionSnapshot?.access?.canAccessFullLibrary
  );
}

function isContextReadable(context, user, subscriptionSnapshot = null) {
  if (!context || !context.is_active) {
    return false;
  }

  if (context.visibility === 'public') {
    return hasAllowedRoles(context, user);
  }

  if (AUTHENTICATED_VISIBILITIES.has(context.visibility)) {
    if (!user || !hasAllowedRoles(context, user)) {
      return false;
    }

    if (context.visibility === 'premium_only') {
      return isPremiumContextReadable(context, user, subscriptionSnapshot);
    }

    return true;
  }

  return !!user && hasAllowedRoles(context, user);
}

function isContextWritable(context, user, intent = 'post', subscriptionSnapshot = null) {
  if (!context || !user || !context.is_active) {
    return false;
  }

  if (!isContextReadable(context, user, subscriptionSnapshot)) {
    return false;
  }

  const readOnly = Boolean(context?.metadata?.read_only);
  if (readOnly) {
    return false;
  }

  const roleKey = intent === 'question' ? 'question_roles' : 'posting_roles';
  const requiredRoles = Array.isArray(context?.membership_rule?.[roleKey])
    ? context.membership_rule[roleKey]
    : [];

  if (requiredRoles.length === 0) {
    if (intent === 'question' && !hasPrivilegedRole(user)) {
      return Boolean(subscriptionSnapshot?.access?.canAskQuestion);
    }

    return true;
  }

  const normalizedRequiredRoles = normalizeRoles(requiredRoles);
  return user.roles.some((role) => normalizedRequiredRoles.includes(role));
}

function canManageSessionQuestion(context, question, user, subscriptionSnapshot = null) {
  if (!user) {
    return false;
  }

  if (hasPrivilegedRole(user) || subscriptionSnapshot?.access?.hasAdminPlatform) {
    return true;
  }

  const hostIds = Array.isArray(context?.metadata?.host_user_ids)
    ? context.metadata.host_user_ids
    : [];
  const speakerIds = Array.isArray(context?.metadata?.speaker_user_ids)
    ? context.metadata.speaker_user_ids
    : [];

  if (hostIds.includes(user.id) || speakerIds.includes(user.id)) {
    return true;
  }

  return question?.addressed_to_id === user.id;
}

module.exports = {
  hasPrivilegedRole,
  isContextReadable,
  isContextWritable,
  canManageSessionQuestion,
  normalizeUser,
};
