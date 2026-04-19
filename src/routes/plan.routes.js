const express = require('express');
const validate = require('../middlewares/validate');
const { success } = require('../utils/response');
const SubscriptionService = require('../services/subscription.service');
const { listPlansSchema } = require('../middlewares/validators/subscription.validator');

const router = express.Router();

router.get('/', validate(listPlansSchema), async (_req, res, next) => {
  try {
    const plans = await SubscriptionService.listPlans();
    return success(res, { plans });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
