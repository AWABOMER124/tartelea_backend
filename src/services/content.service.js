const DirectusService = require('./directus.service');
const ContentMapper = require('../mappers/content.mapper');
const SubscriptionService = require('./subscription.service');
const logger = require('../utils/logger');

class ContentService {
  async getLibraryItems(user, query = {}) {
    try {
      // 1. Fetch from Directus
      const items = await DirectusService.getItems('library_items', {
        filter: { status: { _eq: 'published' } },
        sort: ['-date_created'],
        ...query
      });

      // 2. Map to DTOs
      const mappedItems = items.map(item => ContentMapper.mapLibraryItem(item));

      // 3. User Access Context
      const snapshot = await SubscriptionService.getUserSnapshot(user);

      // 4. Sanitize and Filter
      return mappedItems
        .filter(item => SubscriptionService.isContentAccessible(item, snapshot))
        .map(item => SubscriptionService.sanitizeProtectedMedia(item, snapshot));
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
    const programs = await DirectusService.getItems('programs', {
      filter: { status: { _eq: 'published' } },
      sort: ['sort_order'],
      fields: ['*', 'tracks.*', 'tracks.lessons.*']
    });

    const snapshot = await SubscriptionService.getUserSnapshot(user);
    
    return programs
      .map(p => ContentMapper.mapProgram(p))
      .filter(p => p.visibility === 'public' || snapshot.access.hasAdminPlatform) // Basic visibility
      .map(p => {
        // Nested sanitization for lessons
        if (p.tracks) {
          p.tracks.forEach(t => {
            if (t.lessons) {
              t.lessons = t.lessons
                .filter(l => SubscriptionService.isContentAccessible(l, snapshot))
                .map(l => SubscriptionService.sanitizeProtectedMedia(l, snapshot));
            }
          });
        }
        return p;
      });
  }

  async getLesson(user, id) {
    const lesson = await DirectusService.getItemById('lessons', id);
    if (!lesson || lesson.status !== 'published') return null;

    const mapped = ContentMapper.mapLesson(lesson);
    const snapshot = await SubscriptionService.getUserSnapshot(user);

    if (!SubscriptionService.isContentAccessible(mapped, snapshot)) {
      // Return basic metadata but no content/media
      return {
        ...mapped,
        body: null,
        media_url: null,
        is_locked: true
      };
    }

    return mapped;
  }

  async getFeaturedContent() {
    const banners = await DirectusService.getItems('banners', {
      filter: { status: { _eq: 'published' } },
      sort: ['sort_order']
    });
    
    return {
      banners: banners.map(b => ({
        id: b.id,
        title: b.title,
        image_url: DirectusService.getFileUrl(b.image),
        link: b.link,
        type: b.type
      }))
    };
  }
}

module.exports = new ContentService();
