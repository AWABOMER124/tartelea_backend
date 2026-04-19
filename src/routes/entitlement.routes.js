const express = require('express');
const validate = require('../middlewares/validate');
const { authenticateUser } = require('../middlewares/auth');
const { success } = require('../utils/response');
const SubscriptionService = require('../services/subscription.service');
const { getMySubscriptionSchema } = require('../middlewares/validators/subscription.validator');

const router = express.Router();

router.get('/me', authenticateUser, validate(getMySubscriptionSchema), async (req, res, next) => {
  try {
    const snapshot = await SubscriptionService.getUserSnapshot(req.user);
    return success(res, {
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
      role_overrides: {
        trainer: snapshot.roles.includes('trainer'),
        admin: snapshot.roles.includes('admin'),
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
