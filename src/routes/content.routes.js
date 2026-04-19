const express = require('express');
const ContentService = require('../services/content.service');
const { optionalAuthenticateUser } = require('../middlewares/auth');
const { success, error } = require('../utils/response');

const router = express.Router();

// --- Library Items ---
router.get('/library', optionalAuthenticateUser, async (req, res, next) => {
  try {
    const items = await ContentService.getLibraryItems(req.user, req.query);
    return success(res, items);
  } catch (err) {
    next(err);
  }
});

// --- Articles / Blog ---
router.get('/articles', async (req, res, next) => {
  try {
    const articles = await ContentService.getArticles(req.query);
    return success(res, articles);
  } catch (err) {
    next(err);
  }
});

router.get('/articles/:slug', async (req, res, next) => {
  try {
    const article = await ContentService.getArticleBySlug(req.params.slug);
    if (!article) return error(res, 'Article not found', 404, 'ARTICLE_NOT_FOUND');
    return success(res, article);
  } catch (err) {
    next(err);
  }
});

// --- Programs & Lessons ---
router.get('/programs', optionalAuthenticateUser, async (req, res, next) => {
  try {
    const programs = await ContentService.getPrograms(req.user);
    return success(res, programs);
  } catch (err) {
    next(err);
  }
});

router.get('/lessons/:id', optionalAuthenticateUser, async (req, res, next) => {
  try {
    const lesson = await ContentService.getLesson(req.user, req.params.id);
    if (!lesson) return error(res, 'Lesson not found', 404, 'LESSON_NOT_FOUND');
    return success(res, lesson);
  } catch (err) {
    next(err);
  }
});

// --- Featured / Marketing ---
router.get('/featured', async (req, res, next) => {
  try {
    const featured = await ContentService.getFeaturedContent();
    return success(res, featured);
  } catch (err) {
    next(err);
  }
});

// Legacy / Transitional (Keeping old root for compatibility if needed, but pointing to library)
router.get('/', optionalAuthenticateUser, async (req, res, next) => {
  try {
    const items = await ContentService.getLibraryItems(req.user, req.query);
    return success(res, items);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
