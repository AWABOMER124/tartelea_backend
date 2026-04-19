const express = require('express');
const validate = require('../middlewares/validate');
const { authenticateUser, optionalAuthenticateUser } = require('../middlewares/auth');
const { success } = require('../utils/response');
const CommunityService = require('../services/community.service');
const {
  listFeedSchema,
  createCommunityPostSchema,
  getPostSchema,
  createCommunityCommentSchema,
  postReactionSchema,
  commentReactionSchema,
  createReportSchema,
  listSessionQuestionsSchema,
  createSessionQuestionSchema,
  communityProfileSchema,
} = require('../middlewares/validators/community.validator');

const router = express.Router();

router.get('/contexts', optionalAuthenticateUser, async (req, res, next) => {
  try {
    const contexts = await CommunityService.listContexts(req.user);
    return success(res, { contexts });
  } catch (error) {
    next(error);
  }
});

router.get('/feed', optionalAuthenticateUser, validate(listFeedSchema), async (req, res, next) => {
  try {
    const feed = await CommunityService.listFeed({
      reqUser: req.user,
      contextId: req.query.context_id,
      kind: req.query.kind,
      cursor: req.query.cursor,
      limit: req.query.limit ? Number(req.query.limit) : 20,
    });
    return success(res, feed);
  } catch (error) {
    next(error);
  }
});

router.post('/posts', authenticateUser, validate(createCommunityPostSchema), async (req, res, next) => {
  try {
    const payload = await CommunityService.createPost({ reqUser: req.user, payload: req.body });
    return success(res, payload, 'Community post created successfully', 201);
  } catch (error) {
    next(error);
  }
});

router.get('/posts/:postId', optionalAuthenticateUser, validate(getPostSchema), async (req, res, next) => {
  try {
    const payload = await CommunityService.getPostDetails({
      reqUser: req.user,
      postId: req.params.postId,
    });
    return success(res, payload);
  } catch (error) {
    next(error);
  }
});

router.post(
  '/posts/:postId/comments',
  authenticateUser,
  validate(createCommunityCommentSchema),
  async (req, res, next) => {
    try {
      const payload = await CommunityService.createComment({
        postId: req.params.postId,
        reqUser: req.user,
        payload: req.body,
      });
      return success(res, payload, 'Comment created successfully', 201);
    } catch (error) {
      next(error);
    }
  }
);

router.put('/posts/:postId/reaction', authenticateUser, validate(postReactionSchema), async (req, res, next) => {
  try {
    const payload = await CommunityService.setReaction({
      reqUser: req.user,
      targetType: 'post',
      targetId: req.params.postId,
      payload: req.body,
    });
    return success(res, payload);
  } catch (error) {
    next(error);
  }
});

router.put(
  '/comments/:commentId/reaction',
  authenticateUser,
  validate(commentReactionSchema),
  async (req, res, next) => {
    try {
      const payload = await CommunityService.setReaction({
        reqUser: req.user,
        targetType: 'comment',
        targetId: req.params.commentId,
        payload: req.body,
      });
      return success(res, payload);
    } catch (error) {
      next(error);
    }
  }
);

router.post('/reports', authenticateUser, validate(createReportSchema), async (req, res, next) => {
  try {
    const payload = await CommunityService.createReport({ reqUser: req.user, payload: req.body });
    return success(res, payload, 'Report submitted successfully', 201);
  } catch (error) {
    next(error);
  }
});

router.get(
  '/session-questions',
  optionalAuthenticateUser,
  validate(listSessionQuestionsSchema),
  async (req, res, next) => {
    try {
      const payload = await CommunityService.listSessionQuestions({
        reqUser: req.user,
        contextId: req.query.context_id,
        status: req.query.status,
        cursor: req.query.cursor,
        limit: req.query.limit ? Number(req.query.limit) : 20,
      });
      return success(res, payload);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/session-questions',
  authenticateUser,
  validate(createSessionQuestionSchema),
  async (req, res, next) => {
    try {
      const payload = await CommunityService.createSessionQuestion({ reqUser: req.user, payload: req.body });
      return success(res, payload, 'Session question created successfully', 201);
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/profiles/:userId/summary',
  optionalAuthenticateUser,
  validate(communityProfileSchema),
  async (req, res, next) => {
    try {
      const payload = await CommunityService.getProfileSummary({
        reqUser: req.user,
        userId: req.params.userId,
      });
      return success(res, payload);
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
