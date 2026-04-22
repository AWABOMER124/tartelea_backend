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

function unwrapId(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value.id) return String(value.id);
  return null;
}

function buildCategoryLookups(categories) {
  const byId = new Map();
  const idBySlug = new Map();

  for (const category of categories || []) {
    if (!category?.id) continue;
    const id = String(category.id);
    const slug = typeof category.slug === 'string' ? category.slug.trim() : '';
    const normalizedSlug = slug.toLowerCase();

    byId.set(id, {
      id,
      title: category.title,
      slug,
    });
    if (normalizedSlug) {
      idBySlug.set(normalizedSlug, id);
    }
  }

  return { byId, idBySlug };
}

function buildTrackLookups(tracks) {
  const byId = new Map();
  const idBySlug = new Map();

  for (const track of tracks || []) {
    if (!track?.id) continue;
    const id = String(track.id);
    const slug = typeof track.slug === 'string' ? track.slug.trim() : '';
    const normalizedSlug = slug.toLowerCase();

    byId.set(id, {
      id,
      title: track.title,
      slug,
    });
    if (normalizedSlug) {
      idBySlug.set(normalizedSlug, id);
    }
  }

  return { byId, idBySlug };
}

function hydrateRelations(row, { categoriesById, tracksById } = {}) {
  const categoryId = unwrapId(row?.category_id);
  const trackId = unwrapId(row?.track_id);

  return {
    ...row,
    category_id: categoryId ? categoriesById?.get(categoryId) || { id: categoryId } : null,
    track_id: trackId ? tracksById?.get(trackId) || { id: trackId } : null,
  };
}

function normalizeSlugKey(value) {
  const slug = normalizeSlug(value);
  return slug ? slug.toLowerCase() : null;
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
    const categorySlug = normalizeSlugKey(query.category_slug || query.categorySlug || query.category);

    const [categories, tracks] = await Promise.all([
      DirectusService.getItems('content_categories', {
        filter: { is_active: { _eq: true } },
        sort: ['sort_order', 'title'],
      }),
      DirectusService.getItems('content_tracks', {
        filter: { is_active: { _eq: true } },
        sort: ['sort_order', 'title'],
        fields: ['*'],
      }),
    ]);

    const { byId: categoriesById, idBySlug: categoryIdBySlug } = buildCategoryLookups(categories);

    const resolvedCategoryId = categorySlug ? categoryIdBySlug.get(categorySlug) : null;
    if (categorySlug && !resolvedCategoryId) {
      return [];
    }

    const hydratedTracks = (tracks || [])
      .map((track) => {
        const categoryId = unwrapId(track?.category_id);
        return {
          ...track,
          category_id: categoryId ? categoriesById.get(categoryId) || { id: categoryId } : null,
        };
      })
      .filter((track) => {
        if (!resolvedCategoryId) return true;
        return unwrapId(track?.category_id) === resolvedCategoryId;
      });

    return hydratedTracks.map((t) => ContentMapper.mapTrack(t));
  }

  async getLibraryItems(user, query = {}) {
    try {
      const categorySlug = normalizeSlugKey(query.category_slug || query.categorySlug || query.category);
      const trackSlug = normalizeSlugKey(query.track_slug || query.trackSlug || query.track);
      const contentType = normalizeSlug(query.content_type || query.contentType || query.type);
      const featured = parseBoolean(query.featured ?? query.is_featured ?? query.isFeatured);
      const limit = parseIntOrUndefined(query.limit);
      const offset = parseIntOrUndefined(query.offset);

      const [categories, tracks, items] = await Promise.all([
        DirectusService.getItems('content_categories', {
          filter: { is_active: { _eq: true } },
          sort: ['sort_order', 'title'],
        }),
        DirectusService.getItems('content_tracks', {
          filter: { is_active: { _eq: true } },
          sort: ['sort_order', 'title'],
          fields: ['*'],
        }),
        DirectusService.getItems('library_items', {
          filter: { status: { _eq: 'published' } },
          sort: ['sort_order', '-published_at', '-date_created'],
          fields: ['*'],
        }),
      ]);

      const { byId: categoriesById, idBySlug: categoryIdBySlug } = buildCategoryLookups(categories);
      const { byId: tracksById, idBySlug: trackIdBySlug } = buildTrackLookups(tracks);

      const resolvedCategoryId = categorySlug ? categoryIdBySlug.get(categorySlug) : null;
      if (categorySlug && !resolvedCategoryId) {
        return [];
      }

      const resolvedTrackId = trackSlug ? trackIdBySlug.get(trackSlug) : null;
      if (trackSlug && !resolvedTrackId) {
        return [];
      }

      const normalizedContentType = contentType ? String(contentType).trim().toLowerCase() : null;

      const filteredItems = (items || [])
        .map((item) => hydrateRelations(item, { categoriesById, tracksById }))
        .filter((item) => {
          if (resolvedCategoryId && unwrapId(item?.category_id) !== resolvedCategoryId) {
            return false;
          }
          if (resolvedTrackId && unwrapId(item?.track_id) !== resolvedTrackId) {
            return false;
          }
          if (normalizedContentType) {
            const itemType = String(item?.content_type || item?.type || '').trim().toLowerCase();
            if (itemType !== normalizedContentType) {
              return false;
            }
          }
          if (featured !== undefined && Boolean(item?.is_featured) !== featured) {
            return false;
          }
          return true;
        });

      const pagedItems = (() => {
        const safeOffset = offset ?? 0;
        if (limit === undefined) {
          return filteredItems.slice(safeOffset);
        }
        return filteredItems.slice(safeOffset, safeOffset + limit);
      })();

      const mappedItems = pagedItems.map((item) => ContentMapper.mapLibraryItem(item));
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
    const categorySlug = normalizeSlugKey(query.category_slug || query.categorySlug || query.category);
    const trackSlug = normalizeSlugKey(query.track_slug || query.trackSlug || query.track);
    const featured = parseBoolean(query.featured ?? query.is_featured ?? query.isFeatured);
    const limit = parseIntOrUndefined(query.limit);
    const offset = parseIntOrUndefined(query.offset);

    const [categories, tracks] = await Promise.all([
      DirectusService.getItems('content_categories', {
        filter: { is_active: { _eq: true } },
        sort: ['sort_order', 'title'],
      }),
      DirectusService.getItems('content_tracks', {
        filter: { is_active: { _eq: true } },
        sort: ['sort_order', 'title'],
        fields: ['*'],
      }),
    ]);

    const { byId: categoriesById, idBySlug: categoryIdBySlug } = buildCategoryLookups(categories);
    const { byId: tracksById, idBySlug: trackIdBySlug } = buildTrackLookups(tracks);

    const resolvedCategoryId = categorySlug ? categoryIdBySlug.get(categorySlug) : null;
    if (categorySlug && !resolvedCategoryId) {
      return [];
    }

    const resolvedTrackId = trackSlug ? trackIdBySlug.get(trackSlug) : null;
    if (trackSlug && !resolvedTrackId) {
      return [];
    }

    const baseQuery = {
      sort: ['sort_order', '-date_created'],
      fields: ['*'],
    };

    let programs = [];
    try {
      programs = await DirectusService.getItems('programs', {
        ...baseQuery,
        filter: { status: { _eq: 'published' } },
      });
    } catch (err) {
      if (err?.status === 403) {
        programs = await DirectusService.getItems('programs', baseQuery);
      } else if (err?.status === 404) {
        programs = [];
      } else {
        throw err;
      }
    }

    const filteredPrograms = (programs || [])
      .filter((program) => program?.status === 'published')
      .map((program) => hydrateRelations(program, { categoriesById, tracksById }))
      .filter((program) => {
        if (resolvedCategoryId && unwrapId(program?.category_id) !== resolvedCategoryId) {
          return false;
        }
        if (resolvedTrackId && unwrapId(program?.track_id) !== resolvedTrackId) {
          return false;
        }
        if (featured !== undefined && Boolean(program?.is_featured) !== featured) {
          return false;
        }
        return true;
      });

    const pagedPrograms = (() => {
      const safeOffset = offset ?? 0;
      if (limit === undefined) {
        return filteredPrograms.slice(safeOffset);
      }
      return filteredPrograms.slice(safeOffset, safeOffset + limit);
    })();

    const snapshot = await SubscriptionService.getUserSnapshot(user);

    return pagedPrograms
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

    const banners = await DirectusService.getItems('banners', {
      filter: { status: { _eq: 'published' } },
      sort: ['sort_order'],
    }).catch((err) => {
      // Banners are optional; Directus policies may reject them (403). Keep home working.
      logger.warn('ContentService.getFeaturedContent banners failed', { status: err?.status });
      return [];
    });

    const [featuredLibraryItems, featuredPrograms] = await Promise.all([
      this.getLibraryItems(user, { featured: true, limit: 20 }).catch((err) => {
        if (err?.status === 404) return [];
        throw err;
      }),
      this.getProgramsV2(user, { featured: true, limit: 20 }).catch((err) => {
        if (err?.status === 404) return [];
        throw err;
      }),
    ]);

    return {
      banners: banners.map((b) => ContentMapper.mapBanner(b)),
      featured_library_items: featuredLibraryItems.map((i) =>
        SubscriptionService.sanitizeProtectedMedia(i, snapshot)
      ),
      featured_programs: featuredPrograms.map((p) =>
        SubscriptionService.sanitizeProtectedMedia(p, snapshot)
      ),
    };
  }
}

module.exports = new ContentService();
