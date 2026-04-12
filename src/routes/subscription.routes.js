// src/routes/subscription.routes.js
const express = require('express');
const Subscription = require('../models/Subscription');
const { success } = require('../utils/response');
const env = require('../config/env');

const router = express.Router();

router.get('/:userId', async (req, res) => {
  if (env.SUBSCRIPTIONS_PAUSED) {
    return success(
      res,
      {
        plan_name: 'paused',
        status: 'paused',
        paused: true,
      },
      'Subscriptions are temporarily paused for testing.'
    );
  }

  const subscription = await Subscription.findByUserId(req.params.userId);
  return success(res, subscription);
});

module.exports = router;
