# Tartelea Content Library (Directus Model + Backend API)

This project is **backend-first**. The mobile/web clients must **never** call Directus APIs directly.

Backend reads Directus and exposes stable APIs under:

- `GET /api/v1/contents/categories`
- `GET /api/v1/contents/tracks?category_slug=...`
- `GET /api/v1/contents/library-items?category_slug=...&track_slug=...&content_type=...`
- `GET /api/v1/contents/programs?category_slug=...&track_slug=...`
- `GET /api/v1/contents/programs/:id/lessons`
- `GET /api/v1/contents/featured`

Directus file assets (thumbnails/covers/banners) are proxied via backend:

- `GET /api/v1/contents/assets/:fileId`

## Required Directus Env (Backend)

- `DIRECTUS_URL`
  - Example: `https://cms.tartelea.com` (or `https://cms.tartelea.com/api` if your reverse proxy mounts Directus under `/api`)
- `DIRECTUS_TOKEN` (optional but recommended for private content)

## Collections

### 1) `content_categories`

Top-level sections:

- المدرسة الترتيلية
- التشافي والدعم النفسي

Fields:

- `id` (uuid, PK)
- `title` (string, required)
- `slug` (string, required, unique)
- `description` (text, optional)
- `sort_order` (int, default `0`)
- `is_active` (boolean, default `true`)

Recommended seed:

- title: `المدرسة الترتيلية`, slug: `tartelea_school`, sort_order: `10`, is_active: `true`
- title: `التشافي والدعم النفسي`, slug: `healing_support`, sort_order: `20`, is_active: `true`

### 2) `content_tracks`

Tracks under a category (mainly for `tartelea_school`):

- خلع
- تدبر
- ترتيل
- تحرر

Fields:

- `id` (uuid, PK)
- `category_id` (m2o → `content_categories.id`, required)
- `title` (string, required)
- `slug` (string, required, unique)
- `description` (text, optional)
- `sort_order` (int, default `0`)
- `is_active` (boolean, default `true`)

Recommended seed under `tartelea_school`:

- title: `خلع`, slug: `khala3`, sort_order: `10`
- title: `تدبر`, slug: `tadabbur`, sort_order: `20`
- title: `ترتيل`, slug: `tarteel`, sort_order: `30`
- title: `تحرر`, slug: `tahrur`, sort_order: `40`

### 3) `library_items`

Generic items shown in the library.

Fields:

- `id` (uuid, PK)
- `title` (string, required)
- `slug` (string, optional, unique recommended)
- `description` (text, optional)
- `status` (string, required; use `published` for visible content)
- `category_id` (m2o → `content_categories.id`, required)
- `track_id` (m2o → `content_tracks.id`, optional)
- `content_type` (string, required)
  - supported: `article`, `audio`, `video`, `file`, `exercise`, `meditation`
- `thumbnail` (file, optional)
- `cover_image` (file, optional)
- `media_url` (string/url, optional)
- `file_url` (string/url, optional)
- `duration_seconds` (int, optional)
- `author_name` (string, optional)
- `required_plan_code` (string, optional)
  - recommended values: `free` | `monthly` | `student`
- `is_featured` (boolean, default `false`)
- `sort_order` (int, default `0`)
- `published_at` (datetime, optional)

Notes:

- `thumbnail`/`cover_image` are served to clients via backend proxy (`/api/v1/contents/assets/:fileId`).
- `media_url`/`file_url` should be **public HTTPS URLs** (MinIO/Cloudflare/etc). Backend will **null** them for locked users.
- For Student scoped content, you may add an optional `course_id` (uuid) field:
  - when `required_plan_code=student`, backend will check the user's scoped course access.

### 4) `programs`

Program-level content (like a course container).

Fields:

- `id` (uuid, PK)
- `title` (string, required)
- `slug` (string, optional, unique recommended)
- `description` (text, optional)
- `status` (string, required; use `published`)
- `category_id` (m2o → `content_categories.id`, required)
- `track_id` (m2o → `content_tracks.id`, optional)
- `thumbnail` (file, optional)
- `required_plan_code` (string, optional: `free` | `monthly` | `student`)
- `is_featured` (boolean, default `false`)
- `sort_order` (int, default `0`)

Optional (student scope):

- `course_id` (uuid)

### 5) `program_lessons`

Lessons under a program.

Fields:

- `id` (uuid, PK)
- `program_id` (m2o → `programs.id`, required)
- `title` (string, required)
- `slug` (string, optional, unique recommended)
- `description` (text, optional)
- `lesson_type` (string, optional)
  - suggested: `audio` | `video` | `article` | `file`
- `media_url` (string/url, optional)
- `file_url` (string/url, optional)
- `sort_order` (int, default `0`)
- `required_plan_code` (string, optional: `free` | `monthly` | `student`)
- `status` (string, required; use `published`)

Optional (student scope):

- `course_id` (uuid)

## Feature Flags / Access Rules

Backend uses the subscription snapshot + entitlements:

- `required_plan_code=free` → always visible
- `required_plan_code=monthly` → requires full library access
- `required_plan_code=student` → requires scoped course access (via `course_id`)

When a user cannot access an item, backend returns:

- `is_locked=true`
- `media_url=null`
- `file_url=null`

Metadata remains visible for UX (title/thumbnail/etc).

