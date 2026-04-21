const DirectusService = require('./directus.service');
const ContentMapper = require('../mappers/content.mapper');
const SubscriptionService = require('./subscription.service');
const logger = require('../utils/logger');

function parseBoolean(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  return undefined;
}

function parseIntOrUndefined(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeSlug(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
}

class ContentService {
  async getCategories() {
    const categories = await DirectusService.getItems('content_categories', {
      filter: { is_active: { _eq: true } },
      sort: ['sort_order', 'title'],
    });

    return categories.map((c) => ContentMapper.mapCategory(c));
  }

  async getTracks(query = {}) {
    const categorySlug = normalizeSlug(query.category_slug || query.categorySlug || query.category);

    const filter = {
      is_active: { _eq: true },
    };

    if (categorySlug) {
      // Directus supports nested relational filters.
      filter.category_id = { slug: { _eq: categorySlug } };
    }

    const tracks = await DirectusService.getItems('content_tracks', {
      filter,
      sort: ['sort_order', 'title'],
      fields: ['*', 'category_id.*'],
    });

    return tracks.map((t) => ContentMapper.mapTrack(t));
  }

  async getLibraryItems(user, query = {}) {
    try {
      const categorySlug = normalizeSlug(query.category_slug || query.categorySlug || query.category);
      const trackSlug = normalizeSlug(query.track_slug || query.trackSlug || query.track);
      const contentType = normalizeSlug(query.content_type || query.contentType || query.type);
      const featured = parseBoolean(query.featured ?? query.is_featured ?? query.isFeatured);
      const limit = parseIntOrUndefined(query.limit);
      const offset = parseIntOrUndefined(query.offset);

      const filter = {
        status: { _eq: 'published' },
      };

      if (categorySlug) filter.category_id = { slug: { _eq: categorySlug } };
      if (trackSlug) filter.track_id = { slug: { _eq: trackSlug } };
      if (contentType) filter.content_type = { _eq: contentType };
      if (featured !== undefined) filter.is_featured = { _eq: featured };

      const items = await DirectusService.getItems('library_items', {
        filter,
        sort: ['sort_order', '-published_at', '-date_created'],
        fields: ['*', 'category_id.*', 'track_id.*'],
        ...(limit !== undefined ? { limit } : {}),
        ...(offset !== undefined ? { offset } : {}),
      });

      const mappedItems = items.map((item) => ContentMapper.mapLibraryItem(item));
      const snapshot = await SubscriptionService.getUserSnapshot(user);

      // Do not hide locked items; return them with media removed + is_locked flag.
      return mappedItems.map((item) => SubscriptionService.sanitizeProtectedMedia(item, snapshot));
    } catch (error) {
      logger.error('ContentService.getLibraryItems failed', { error: error.message });
      throw error;
    }
  }

  async getArticles(query = {}) {
    const articles = await DirectusService.getItems('articles', {
      filter: { status: { _eq: 'published' } },
      sort: ['-published_date', '-date_created'],
      ...query
    });
    return articles.map(a => ContentMapper.mapArticle(a));
  }

  async getArticleBySlug(slug) {
    const articles = await DirectusService.getItems('articles', {
      filter: { 
        slug: { _eq: slug },
        status: { _eq: 'published' }
      },
      limit: 1
    });
    
    if (!articles.length) return null;
    return ContentMapper.mapArticle(articles[0]);
  }

  async getPrograms(user) {
    return this.getProgramsV2(user);
  }

  async getProgramsV2(user, query = {}) {
    const categorySlug = normalizeSlug(query.category_slug || query.categorySlug || query.category);
    const trackSlug = normalizeSlug(query.track_slug || query.trackSlug || query.track);
    const featured = parseBoolean(query.featured ?? query.is_featured ?? query.isFeatured);
    const limit = parseIntOrUndefined(query.limit);
    const offset = parseIntOrUndefined(query.offset);

    const filter = {
      status: { _eq: 'published' },
    };

    if (categorySlug) filter.category_id = { slug: { _eq: categorySlug } };
    if (trackSlug) filter.track_id = { slug: { _eq: trackSlug } };
    if (featured !== undefined) filter.is_featured = { _eq: featured };

    const programs = await DirectusService.getItems('programs', {
      filter,
      sort: ['sort_order', '-date_created'],
      fields: ['*', 'category_id.*', 'track_id.*'],
      ...(limit !== undefined ? { limit } : {}),
      ...(offset !== undefined ? { offset } : {}),
    });

    const snapshot = await SubscriptionService.getUserSnapshot(user);

    return programs
      .map((p) => ContentMapper.mapProgram(p))
      .map((p) => SubscriptionService.sanitizeProtectedMedia(p, snapshot));
  }

  async getProgramLessons(user, programId, query = {}) {
    const limit = parseIntOrUndefined(query.limit);
    const offset = parseIntOrUndefined(query.offset);

    const lessons = await DirectusService.getItems('program_lessons', {
      filter: {
        status: { _eq: 'published' },
        program_id: { _eq: programId },
      },
      sort: ['sort_order', '-date_created'],
      fields: ['*', 'program_id.id'],
      ...(limit !== undefined ? { limit } : {}),
      ...(offset !== undefined ? { offset } : {}),
    });

    const snapshot = await SubscriptionService.getUserSnapshot(user);

    return lessons
      .map((l) => ContentMapper.mapProgramLesson(l))
      .map((l) => SubscriptionService.sanitizeProtectedMedia(l, snapshot));
  }

  async getLesson(user, id) {
    const lesson = await DirectusService.getItemById('program_lessons', id, {
      fields: ['*', 'program_id.id'],
    }).catch((err) => {
      if (err?.status === 404) return null;
      throw err;
    });

    if (!lesson || lesson.status !== 'published') return null;

    const snapshot = await SubscriptionService.getUserSnapshot(user);
    const mapped = ContentMapper.mapProgramLesson(lesson);
    return SubscriptionService.sanitizeProtectedMedia(mapped, snapshot);
  }

  async getFeaturedContent(user) {
    const snapshot = await SubscriptionService.getUserSnapshot(user);

    // Banners are optional. If Directus collection isn't ready yet, keep home working.
    const banners = await DirectusService.getItems('banners', {
      filter: { status: { _eq: 'published' } },
      sort: ['sort_order'],
    }).catch((err) => {
      if (err?.status === 404) return [];
      throw err;
    });

    const [featuredLibraryItems, featuredPrograms] = await Promise.all([
      DirectusService.getItems('library_items', {
        filter: { status: { _eq: 'published' }, is_featured: { _eq: true } },
        sort: ['sort_order', '-published_at', '-date_created'],
        fields: ['*', 'category_id.*', 'track_id.*'],
        limit: 20,
      }).catch((err) => {
        if (err?.status === 404) return [];
        throw err;
      }),
      DirectusService.getItems('programs', {
        filter: { status: { _eq: 'published' }, is_featured: { _eq: true } },
        sort: ['sort_order', '-date_created'],
        fields: ['*', 'category_id.*', 'track_id.*'],
        limit: 20,
      }).catch((err) => {
        if (err?.status === 404) return [];
        throw err;
      }),
    ]);

    return {
      banners: banners.map((b) => ContentMapper.mapBanner(b)),
      featured_library_items: featuredLibraryItems
        .map((i) => ContentMapper.mapLibraryItem(i))
        .map((i) => SubscriptionService.sanitizeProtectedMedia(i, snapshot)),
      featured_programs: featuredPrograms
        .map((p) => ContentMapper.mapProgram(p))
        .map((p) => SubscriptionService.sanitizeProtectedMedia(p, snapshot)),
    };
  }
}

module.exports = new ContentService();
