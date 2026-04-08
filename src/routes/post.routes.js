const express = require('express');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const { authenticateUser } = require('../middlewares/auth');
const { success, error } = require('../utils/response');
const validate = require('../middlewares/validate');
const { createPostSchema, postCommentSchema } = require('../middlewares/validators/post.validator');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
    const posts = await Post.findAll({ limit, offset });
    return success(res, { posts, pagination: { limit, offset } });
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticateUser, validate(createPostSchema), async (req, res, next) => {
  try {
    const post = await Post.create(req.user.id, req.body);
    return success(res, { post }, 'Post created successfully', 201);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/like', authenticateUser, async (req, res, next) => {
  try {
    const likes = await Post.like(req.params.id);
    if (!likes) return error(res, 'Post not found', 404, 'POST_NOT_FOUND');
    return success(res, { likes_count: likes.likes_count }, 'Post liked');
  } catch (err) {
    next(err);
  }
});

router.post('/:id/comment', authenticateUser, validate(postCommentSchema), async (req, res, next) => {
  try {
    const comment = await Comment.create(req.params.id, req.user.id, req.body.content);
    return success(res, { comment }, 'Comment added successfully', 201);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/comments', async (req, res, next) => {
  try {
    const comments = await Comment.findByPostId(req.params.id);
    return success(res, { comments });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
