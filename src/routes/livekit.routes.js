// ADR-001 / STEP 3 guardrail:
// Backend-issued tokens are the official path going forward.
// New LiveKit token flows must not be added through Supabase functions.
// `/livekit/token` remains transitional compatibility only and delegates to
// `/sessions/:id/join` under the hood.
const express = require('express');
const livekitController = require('../controllers/livekit.controller');
const rateLimit = require('express-rate-limit');
const validate = require('../middlewares/validate');
const { authenticateUser: auth } = require('../middlewares/auth');
const { livekitTokenSchema } = require('../middlewares/validators/livekit.validator');
const router = express.Router();

const tokenLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/token', auth, tokenLimiter, validate(livekitTokenSchema), livekitController.getToken);

module.exports = router;
