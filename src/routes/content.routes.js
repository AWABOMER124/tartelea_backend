const express = require('express');
const ContentService = require('../services/content.service');
const DirectusService = require('../services/directus.service');
const { optionalAuthenticateUser } = require('../middlewares/auth');
const { success, error } = require('../utils/response');
const { Readable } = require('stream');

const router = express.Router();

// --- CMS Assets (Proxy) ---
// Clients should never call Directus directly; serve CMS assets via backend.
router.get('/assets/:fileId', async (req, res, next) => {
  try {
    const upstream = await DirectusService.fetchAsset(req.params.fileId);

    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    const cacheControl = upstream.headers.get('cache-control');
    if (cacheControl) res.setHeader('Cache-Control', cacheControl);

    res.status(upstream.status);

    if (!upstream.body) return res.end();
    return Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    next(err);
  }
});

// --- Categories & Tracks ---
router.get('/categories', async (req, res, next) => {
  try {
    const categories = await ContentService.getCategories();
    return success(res, categories);
  } catch (err) {
    next(err);
  }
});

router.get('/tracks', async (req, res, next) => {
  try {
    const tracks = await ContentService.getTracks(req.query);
    return success(res, tracks);
  } catch (err) {
    next(err);
  }
});

// --- Library Items ---
router.get('/library', optionalAuthenticateUser, async (req, res, next) => {
  try {
    const items = await ContentService.getLibraryItems(req.user, req.query);
    return success(res, items);
  } catch (err) {
    next(err);
  }
});

router.get('/library-items', optionalAuthenticateUser, async (req, res, next) => {
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
    const programs = await ContentService.getProgramsV2(req.user, req.query);
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

router.get('/programs/:id/lessons', optionalAuthenticateUser, async (req, res, next) => {
  try {
    const lessons = await ContentService.getProgramLessons(req.user, req.params.id, req.query);
    return success(res, lessons);
  } catch (err) {
    next(err);
  }
});

// --- Featured / Marketing ---
router.get('/featured', optionalAuthenticateUser, async (req, res, next) => {
  try {
    const featured = await ContentService.getFeaturedContent(req.user);
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
