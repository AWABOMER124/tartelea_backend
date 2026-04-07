// src/routes/workshop.routes.js
const express = require('express');
const Workshop = require('../models/Workshop');
const { success } = require('../utils/response');

const router = express.Router();

router.get('/', async (req, res) => {
  const workshops = await Workshop.findAll();
  return success(res, workshops);
});

module.exports = router;
