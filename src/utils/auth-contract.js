const { getPrimaryRole, normalizeRoles } = require('./roles');

function compact(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

function toContractUser(rawUser) {
  if (!rawUser) {
    return null;
  }

  const roles = normalizeRoles(rawUser.roles || rawUser.role, {
    fallback: rawUser.id ? 'member' : 'guest',
  });
  const role = getPrimaryRole(roles, {
    fallback: rawUser.id ? 'member' : 'guest',
  });

  return compact({
    id: rawUser.id || null,
    email: rawUser.email || null,
    fullName: rawUser.full_name ?? rawUser.fullName ?? null,
    avatarUrl: rawUser.avatar_url ?? rawUser.avatarUrl ?? null,
    bio: rawUser.bio ?? null,
    country: rawUser.country ?? null,
    role,
    roles,
    isVerified: Boolean(rawUser.is_verified ?? rawUser.isVerified ?? false),
    status: rawUser.status || 'active',
    specialties: rawUser.specialties || [],
    services: rawUser.services || [],
    socialLinks: rawUser.social_links ?? rawUser.socialLinks ?? {},
    isPublicProfile: Boolean(rawUser.is_public_profile ?? rawUser.isPublicProfile ?? false),
  });
}

function toLegacyUser(contractUser) {
  if (!contractUser) {
    return null;
  }

  return compact({
    id: contractUser.id,
    email: contractUser.email,
    full_name: contractUser.fullName ?? null,
    avatar_url: contractUser.avatarUrl ?? null,
    bio: contractUser.bio ?? null,
    country: contractUser.country ?? null,
    role: contractUser.role,
    roles: contractUser.roles,
    is_verified: contractUser.isVerified,
    status: contractUser.status,
    specialties: contractUser.specialties,
    services: contractUser.services,
    social_links: contractUser.socialLinks,
    is_public_profile: contractUser.isPublicProfile,
  });
}

function buildAuthEnvelope({
  user,
  accessToken = null,
  refreshToken = null,
  extra = {},
}) {
  const contractUser = toContractUser(user);
  const legacyUser = toLegacyUser(contractUser);
  const normalizedExtra = compact(extra);

  return compact({
    user: contractUser,
    accessToken,
    refreshToken,
    ...normalizedExtra,
    data: compact({
      user: legacyUser,
      token: accessToken,
      accessToken,
      refreshToken,
      ...normalizedExtra,
    }),
  });
}

function buildSessionEnvelope({ user, extra = {} }) {
  const contractUser = toContractUser(user);
  const legacyUser = toLegacyUser(contractUser);
  const normalizedExtra = compact(extra);

  return compact({
    user: contractUser,
    ...normalizedExtra,
    data: compact({
      user: legacyUser,
      ...normalizedExtra,
    }),
  });
}

module.exports = {
  buildAuthEnvelope,
  buildSessionEnvelope,
  toContractUser,
};
