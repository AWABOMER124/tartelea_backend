const express = require('express');
const Content = require('../models/Content');
const { success, error } = require('../utils/response');

const router = express.Router();

router.get('/', async (req, res) => {
  const contents = await Content.findAll(req.query);
  return success(res, contents);
});

router.get('/:id', async (req, res) => {
  const content = await Content.findById(req.params.id);
  if (!content) return error(res, 'Content not found', 404);
  return success(res, content);
});

module.exports = router;
