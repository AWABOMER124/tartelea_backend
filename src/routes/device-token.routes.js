const express = require('express');
const { z } = require('zod');
const { query } = require('../db');
const { authenticateUser } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { success } = require('../utils/response');

const router = express.Router();

const tokenSchema = z.object({
  body: z.object({
    token: z.string().min(10).max(4096),
    platform: z.enum(['android', 'ios', 'web']),
  }),
});

router.post('/', authenticateUser, validate(tokenSchema), async (req, res) => {
  const { token, platform } = req.body;
  await query(
    `INSERT INTO device_tokens (user_id, token, platform, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, token)
     DO UPDATE SET platform = EXCLUDED.platform, updated_at = NOW()`,
    [req.user.id, token, platform]
  );
  return success(res, { registered: true }, 201);
});

router.delete('/', authenticateUser, async (req, res) => {
  await query('DELETE FROM device_tokens WHERE user_id = $1', [req.user.id]);
  return success(res, { removed: true });
});

module.exports = router;
