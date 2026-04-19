const express = require('express');
const validate = require('../middlewares/validate');
const { authenticateUser, optionalAuthenticateUser } = require('../middlewares/auth');
const { success } = require('../utils/response');
const SessionService = require('../services/session.service');
const {
  listSessionsSchema,
  getSessionSchema,
  createSessionSchema,
  joinSessionSchema,
  leaveSessionSchema,
  sessionActionSchema,
} = require('../middlewares/validators/session.validator');

const router = express.Router();

router.get('/', optionalAuthenticateUser, validate(listSessionsSchema), async (req, res, next) => {
  try {
    const payload = await SessionService.listSessions({
      reqUser: req.user,
      status: req.query.status,
      limit: req.query.limit ? Number(req.query.limit) : 50,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    });

    return success(res, payload);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', optionalAuthenticateUser, validate(getSessionSchema), async (req, res, next) => {
  try {
    const payload = await SessionService.getSessionDetails({
      reqUser: req.user,
      sessionId: req.params.id,
    });

    return success(res, payload);
  } catch (error) {
    next(error);
  }
});

router.post(
  '/',
  authenticateUser,
  validate(createSessionSchema),
  async (req, res, next) => {
    try {
      const payload = await SessionService.createSession({
        reqUser: req.user,
        payload: req.body,
      });

      return success(res, payload, 'Session created successfully', 201);
    } catch (error) {
      next(error);
    }
  }
);

router.post('/:id/join', authenticateUser, validate(joinSessionSchema), async (req, res, next) => {
  try {
    const payload = await SessionService.joinSession({
      reqUser: req.user,
      sessionId: req.params.id,
    });

    return success(res, payload, 'Session join resolved successfully');
  } catch (error) {
    next(error);
  }
});

router.post('/:id/leave', authenticateUser, validate(leaveSessionSchema), async (req, res, next) => {
  try {
    const payload = await SessionService.leaveSession({
      reqUser: req.user,
      sessionId: req.params.id,
    });

    return success(res, payload, 'Session leave resolved successfully');
  } catch (error) {
    next(error);
  }
});

router.post('/:id/actions', authenticateUser, validate(sessionActionSchema), async (req, res, next) => {
  try {
    const payload = await SessionService.manageSessionAction({
      reqUser: req.user,
      sessionId: req.params.id,
      action: req.body.action,
      targetUserId: req.body.target_user_id,
    });

    return success(res, payload, 'Session action applied successfully');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
