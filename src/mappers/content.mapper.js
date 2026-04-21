const DirectusService = require('../services/directus.service');

function normalizePlanCode(value) {
  if (typeof value !== 'string') return 'free';
  const normalized = value.trim().toLowerCase();
  return normalized || 'free';
}

function planCodeToAccessTier(requiredPlanCode) {
  const planCode = normalizePlanCode(requiredPlanCode);
  if (planCode === 'monthly') return 'full';
  if (planCode === 'student') return 'course';
  return 'free';
}

function unwrapId(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value.id) return value.id;
  return null;
}

function cmsAssetPath(fileOrId) {
  const fileId = unwrapId(fileOrId);
  if (!fileId) return null;
  // Serve CMS assets via backend proxy so clients never call Directus directly.
  return `/contents/assets/${fileId}`;
}

function mapCategoryRef(category) {
  if (!category) return null;
  if (typeof category === 'string') return { id: category };
  return {
    id: category.id,
    title: category.title,
    slug: category.slug,
  };
}

function mapTrackRef(track) {
  if (!track) return null;
  if (typeof track === 'string') return { id: track };
  return {
    id: track.id,
    title: track.title,
    slug: track.slug,
  };
}

class ContentMapper {
  mapArticle(article) {
    if (!article) return null;
    return {
      id: article.id,
      slug: article.slug,
      title: article.title,
      summary: article.summary || null,
      body: article.body || null,
      cover_image_url: cmsAssetPath(article.cover_image),
      category: article.category || null,
      tags: article.tags || [],
      status: article.status || null,
      published_at: article.published_date || article.date_created || null,
    };
  }

  mapCategory(category) {
    if (!category) return null;
    return {
      id: category.id,
      title: category.title,
      slug: category.slug,
      description: category.description || null,
      sort_order: category.sort_order ?? 0,
      is_active: category.is_active ?? true,
    };
  }

  mapTrack(track) {
    if (!track) return null;
    return {
      id: track.id,
      category: mapCategoryRef(track.category_id),
      title: track.title,
      slug: track.slug,
      description: track.description || null,
      sort_order: track.sort_order ?? 0,
      is_active: track.is_active ?? true,
    };
  }

  mapLibraryItem(item) {
    if (!item) return null;

    const requiredPlanCode = normalizePlanCode(item.required_plan_code);
    const contentType = item.content_type || item.type || 'article';

    return {
      id: item.id,
      title: item.title,
      slug: item.slug || null,
      description: item.description || null,
      status: item.status || null,
      category: mapCategoryRef(item.category_id),
      track: mapTrackRef(item.track_id),
      content_type: contentType,
      thumbnail_url: cmsAssetPath(item.thumbnail),
      cover_image_url: cmsAssetPath(item.cover_image),
      media_url: item.media_url || cmsAssetPath(item.media_file),
      file_url: item.file_url || null,
      duration_seconds: item.duration_seconds ?? null,
      author_name: item.author_name || null,
      required_plan_code: requiredPlanCode,
      is_featured: Boolean(item.is_featured),
      sort_order: item.sort_order ?? 0,
      published_at: item.published_at || item.date_created || null,
      // Used by SubscriptionService for access decisions + media sanitization.
      access_tier: planCodeToAccessTier(requiredPlanCode),
      course_id: item.course_id || null,
      metadata: item.metadata || {},
      // Populated by SubscriptionService.sanitizeProtectedMedia
      is_locked: false,
    };
  }

  mapProgram(program) {
    if (!program) return null;

    const requiredPlanCode = normalizePlanCode(program.required_plan_code);

    return {
      id: program.id,
      title: program.title,
      slug: program.slug || null,
      description: program.description || null,
      status: program.status || null,
      category: mapCategoryRef(program.category_id),
      track: mapTrackRef(program.track_id),
      thumbnail_url: cmsAssetPath(program.thumbnail) || cmsAssetPath(program.cover_image),
      required_plan_code: requiredPlanCode,
      is_featured: Boolean(program.is_featured),
      sort_order: program.sort_order ?? 0,
      access_tier: planCodeToAccessTier(requiredPlanCode),
      course_id: program.course_id || null,
      metadata: program.metadata || {},
      is_locked: false,
    };
  }

  mapProgramLesson(lesson) {
    if (!lesson) return null;

    const requiredPlanCode = normalizePlanCode(lesson.required_plan_code);

    return {
      id: lesson.id,
      program_id: unwrapId(lesson.program_id) || null,
      title: lesson.title,
      slug: lesson.slug || null,
      description: lesson.description || null,
      status: lesson.status || null,
      lesson_type: lesson.lesson_type || null,
      sort_order: lesson.sort_order ?? 0,
      media_url: lesson.media_url || cmsAssetPath(lesson.media_file),
      file_url: lesson.file_url || null,
      required_plan_code: requiredPlanCode,
      access_tier: planCodeToAccessTier(requiredPlanCode),
      course_id: lesson.course_id || null,
      metadata: lesson.metadata || {},
      is_locked: false,
    };
  }

  mapBanner(banner) {
    if (!banner) return null;
    return {
      id: banner.id,
      title: banner.title,
      image_url: cmsAssetPath(banner.image) || DirectusService.getFileUrl(banner.image),
      link: banner.link || null,
      type: banner.type || null,
    };
  }
}

module.exports = new ContentMapper();
