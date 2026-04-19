const express = require('express');
const validate = require('../middlewares/validate');
const { authenticateUser } = require('../middlewares/auth');
const { success } = require('../utils/response');
const SubscriptionService = require('../services/subscription.service');
const { getMySubscriptionSchema } = require('../middlewares/validators/subscription.validator');

const router = express.Router();

router.get('/me', authenticateUser, validate(getMySubscriptionSchema), async (req, res, next) => {
  try {
    const payload = await SubscriptionService.getUserContract(req.user);
    return success(res, payload);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
