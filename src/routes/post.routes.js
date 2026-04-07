const express = require('express');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const { authenticateUser } = require('../middlewares/auth');
const { success, error } = require('../utils/response');
const validate = require('../middlewares/validate');
const { createPostSchema, postCommentSchema } = require('../middlewares/validators/post.validator');

const router = express.Router();

router.get('/', async (req, res) => {
  const posts = await Post.findAll();
  return success(res, posts);
});

router.post('/', authenticateUser, validate(createPostSchema), async (req, res) => {
  const post = await Post.create(req.user.id, req.body);
  return success(res, post, 201);
});

router.post('/:id/like', authenticateUser, async (req, res) => {
  const likes = await Post.like(req.params.id);
  return success(res, likes);
});

router.post('/:id/comment', authenticateUser, validate(postCommentSchema), async (req, res) => {
  const comment = await Comment.create(req.params.id, req.user.id, req.body.content);
  return success(res, comment, 201);
});

router.get('/:id/comments', async (req, res) => {
  const comments = await Comment.findByPostId(req.params.id);
  return success(res, comments);
});

module.exports = router;
