const express = require('express');
const validate = require('../middlewares/validate');
const { authenticateUser, authorizeRoles } = require('../middlewares/auth');
const { success } = require('../utils/response');
const CommunityService = require('../services/community.service');
const {
  listReportsSchema,
  listAdminPostsSchema,
  listPinsSchema,
  upsertContextSchema,
  updateContextSchema,
  moderationActionSchema,
  createPinSchema,
  deletePinSchema,
  updateSessionQuestionSchema,
} = require('../middlewares/validators/community.validator');

const router = express.Router();

router.use(authenticateUser, authorizeRoles('admin', 'moderator'));

router.get('/contexts', async (_req, res, next) => {
  try {
    const contexts = await CommunityService.listAdminContexts();
    return success(res, { contexts });
  } catch (error) {
    next(error);
  }
});

router.get('/posts', validate(listAdminPostsSchema), async (req, res, next) => {
  try {
    const payload = await CommunityService.listAdminPosts({
      status: req.query.status,
      contextId: req.query.context_id,
      limit: req.query.limit ? Number(req.query.limit) : 50,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    });
    return success(res, payload);
  } catch (error) {
    next(error);
  }
});

router.get('/pins', validate(listPinsSchema), async (req, res, next) => {
  try {
    const payload = await CommunityService.listPins({
      contextId: req.query.context_id,
      limit: req.query.limit ? Number(req.query.limit) : 50,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    });
    return success(res, payload);
  } catch (error) {
    next(error);
  }
});

router.post('/contexts', validate(upsertContextSchema), async (req, res, next) => {
  try {
    const context = await CommunityService.upsertContext(req.body);
    return success(res, { context }, 'Community context upserted successfully', 201);
  } catch (error) {
    next(error);
  }
});

router.patch('/contexts/:contextId', validate(updateContextSchema), async (req, res, next) => {
  try {
    const context = await CommunityService.updateContext(req.params.contextId, req.body);
    return success(res, { context }, 'Community context updated successfully');
  } catch (error) {
    next(error);
  }
});

router.get('/reports', validate(listReportsSchema), async (req, res, next) => {
  try {
    const reports = await CommunityService.listReports({
      status: req.query.status,
      targetType: req.query.target_type,
      limit: req.query.limit ? Number(req.query.limit) : 50,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    });
    return success(res, { reports });
  } catch (error) {
    next(error);
  }
});

router.post('/moderation-actions', validate(moderationActionSchema), async (req, res, next) => {
  try {
    const action = await CommunityService.applyModerationAction({
      actor: req.user,
      payload: req.body,
    });
    return success(res, { action }, 'Moderation action applied successfully');
  } catch (error) {
    next(error);
  }
});

router.post('/pins', validate(createPinSchema), async (req, res, next) => {
  try {
    const payload = await CommunityService.createPin({
      actor: req.user,
      payload: req.body,
    });
    return success(res, payload, 'Post pinned successfully', 201);
  } catch (error) {
    next(error);
  }
});

router.delete('/pins/:pinId', validate(deletePinSchema), async (req, res, next) => {
  try {
    const payload = await CommunityService.deletePin(req.params.pinId);
    return success(res, payload, 'Pin removed successfully');
  } catch (error) {
    next(error);
  }
});

router.patch(
  '/session-questions/:questionId',
  validate(updateSessionQuestionSchema),
  async (req, res, next) => {
    try {
      const payload = await CommunityService.updateSessionQuestion({
        actor: req.user,
        questionId: req.params.questionId,
        payload: req.body,
      });
      return success(res, payload, 'Session question updated successfully');
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
