const DirectusService = require('../services/directus.service');

class ContentMapper {
  mapLibraryItem(item) {
    if (!item) return null;
    return {
      id: item.id,
      title: item.title,
      description: item.description,
      type: item.type || 'article',
      // Public assets
      thumbnail_url: DirectusService.getFileUrl(item.thumbnail),
      // Protected media (handled by SubscriptionService later if needed)
      media_url: DirectusService.getFileUrl(item.media_file),
      category: item.category,
      access_tier: item.required_plan_code === 'monthly' ? 'full' : (item.required_plan_code === 'student' ? 'course' : 'free'),
      course_id: item.course_id || null,
      metadata: item.metadata || {},
      status: item.status,
      created_at: item.date_created,
      updated_at: item.date_updated,
    };
  }

  mapArticle(article) {
    if (!article) return null;
    return {
      id: article.id,
      slug: article.slug,
      title: article.title,
      summary: article.summary,
      body: article.body,
      cover_image_url: DirectusService.getFileUrl(article.cover_image),
      category: article.category,
      tags: article.tags || [],
      status: article.status,
      published_at: article.published_date || article.date_created,
    };
  }

  mapProgram(program) {
    if (!program) return null;
    return {
      id: program.id,
      slug: program.slug,
      title: program.title,
      description: program.description,
      cover_image_url: DirectusService.getFileUrl(program.cover_image),
      visibility: program.visibility || 'public',
      order: program.sort_order || 0,
      status: program.status,
      tracks: (program.tracks || []).map(t => this.mapTrack(t)),
    };
  }

  mapTrack(track) {
    if (!track) return null;
    return {
      id: track.id,
      title: track.title,
      description: track.description,
      order: track.sort_order || 0,
      status: track.status,
      lessons: (track.lessons || []).map(l => this.mapLesson(l)),
    };
  }

  mapLesson(lesson) {
    if (!lesson) return null;
    return {
      id: lesson.id,
      title: lesson.title,
      description: lesson.description,
      body: lesson.body,
      media_url: DirectusService.getFileUrl(lesson.media_file),
      access_tier: lesson.required_plan_code === 'monthly' ? 'full' : (lesson.required_plan_code === 'student' ? 'course' : 'free'),
      course_id: lesson.course_id || null,
      order: lesson.sort_order || 0,
      status: lesson.status,
    };
  }

  mapWorkshop(workshop) {
    if (!workshop) return null;
    return {
      id: workshop.id,
      title: workshop.title,
      description: workshop.description,
      cover_image_url: DirectusService.getFileUrl(workshop.cover_image),
      trainer: workshop.trainer_info || {},
      schedule: workshop.schedule_info || {},
      pricing: workshop.pricing_info || {},
      status: workshop.status,
    };
  }
}

module.exports = new ContentMapper();
