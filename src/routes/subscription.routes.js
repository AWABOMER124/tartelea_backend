// src/routes/subscription.routes.js
const express = require('express');
const Subscription = require('../models/Subscription');
const { success } = require('../utils/response');

const router = express.Router();

router.get('/:userId', async (req, res) => {
  const subscription = await Subscription.findByUserId(req.params.userId);
  return success(res, subscription);
});

module.exports = router;
