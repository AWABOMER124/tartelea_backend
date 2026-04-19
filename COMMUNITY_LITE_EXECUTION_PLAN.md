# Community Lite Execution Plan

## Current State

- Backend already has legacy `posts`, `comments`, and `reactions`.
- Mobile already consumes simple backend post APIs.
- Web community still writes directly to Supabase in `src/pages/Community.tsx` and `src/pages/PostDetail.tsx`.
- Backend already normalizes roles into `student`, `trainer`, `moderator`, and `admin`.
- LiveKit is already integrated in the main backend.
- Admin already has audit logging and pinning concepts.

## 1. Product Scope

### What Community Lite Is

Community Lite is an embedded asynchronous discussion layer inside the product, optimized for:

- short posts
- scoped discussions
- session questions
- simple likes
- basic moderation

It is not a full forum platform.

### Phase 1 Includes

- general feed
- posts
- comments
- one-level replies
- like reaction
- report content
- pin posts inside a scope
- session questions
- activity/profile summary
- basic moderation
- filters by program, track, session, room, and general community

### Deferred

- full search
- mentions
- notification fanout
- advanced ranking
- rich media composer
- advanced moderator workflows

### Not Now

- full Discourse-style forum
- unlimited thread depth
- realtime chat
- custom community admins
- marketplace/community commerce

## 2. Chosen Architecture

### Single Path

1. Freeze the legacy `posts/comments/reactions` design.
2. Build a dedicated backend-owned community module.
3. Store all community truth in PostgreSQL under `community_*`.
4. Use MinIO for attachments.
5. Keep Directus for editorial metadata only.
6. Keep LiveKit separate, but link sessions/rooms into community through context IDs.

### Ownership

#### Main Backend

Owns:

- auth
- access policy
- community rules
- reporting
- moderation
- question flow
- attachment authorization

#### PostgreSQL

Owns:

- posts
- scopes
- comments
- reactions
- reports
- questions
- pins
- moderation logs

#### MinIO

Owns:

- uploaded images/files

#### Directus

Stays responsible for:

- programs
- tracks
- editorial content

Directus does not own community writes.

#### LiveKit

Stays responsible for:

- audio transport
- room connectivity

LiveKit does not own community history.

### Integration Model

Add a backend-owned registry table called `community_contexts`.

This is the canonical list of discussable spaces:

- general
- program
- track
- course
- workshop/session
- audio room
- speaker

Posts and questions link to context rows, not directly to Directus or frontend-only IDs.

### Data Flow

```text
Mobile/Web
  -> Backend Community API
    -> Access Policy
    -> Community Services
      -> PostgreSQL community_* tables
      -> MinIO attachment store
      -> Directus metadata lookup/sync
      -> LiveKit-linked room/session identity
      -> Admin dashboard / Appsmith moderation views
```

## 3. Database Design

### Existing User Linkage

Reuse existing:

- `users`
- `profiles`
- `user_roles`

Do not create a second community user table.

### Required Tables

#### `community_contexts`

Canonical scope registry.

Key fields:

- `id uuid pk`
- `context_type enum`
- `source_system text`
- `source_id text`
- `slug text unique`
- `title text`
- `visibility enum`
- `membership_rule jsonb`
- `metadata jsonb`
- `is_active boolean`
- `created_at`
- `updated_at`

#### `community_posts`

Key fields:

- `id uuid pk`
- `author_id -> users.id`
- `primary_context_id -> community_contexts.id`
- `kind enum`
- `title`
- `body`
- `status enum`
- `visibility_override`
- `is_locked`
- `comments_count`
- `reactions_count`
- `attachments_count`
- `last_activity_at`
- `edited_at`
- `deleted_at`
- `deleted_by`
- `created_at`
- `updated_at`

#### `community_post_scopes`

Allows one post to belong to multiple contexts.

Key fields:

- `post_id`
- `context_id`
- `is_primary`
- `created_at`

Rules:

- unique `(post_id, context_id)`
- one primary scope per post

#### `community_comments`

Key fields:

- `id uuid pk`
- `post_id`
- `parent_comment_id`
- `author_id`
- `depth`
- `body`
- `status`
- `replies_count`
- `reactions_count`
- `edited_at`
- `deleted_at`
- `deleted_by`
- `created_at`
- `updated_at`

Guardrail:

- depth is limited to `0` or `1`

#### `community_reactions`

Key fields:

- `id uuid pk`
- `user_id`
- `target_type`
- `post_id`
- `comment_id`
- `reaction_type`
- `created_at`

Guardrail:

- exactly one target is set

#### `community_reports`

Key fields:

- `id uuid pk`
- `reporter_id`
- `target_type`
- `post_id`
- `comment_id`
- `question_id`
- `reason_code`
- `note`
- `status`
- `assigned_to`
- `resolved_at`
- `resolution_note`
- `created_at`
- `updated_at`

#### `community_pins`

Key fields:

- `id uuid pk`
- `context_id`
- `post_id`
- `pinned_by`
- `reason`
- `sort_order`
- `starts_at`
- `ends_at`
- `created_at`

#### `session_questions`

Separate table, not normal comments.

Key fields:

- `id uuid pk`
- `context_id`
- `asked_by_id`
- `addressed_to_id`
- `body`
- `status`
- `is_anonymous`
- `answer_text`
- `answered_by_id`
- `answered_at`
- `approved_by_id`
- `approved_at`
- `rejected_reason`
- `deleted_at`
- `created_at`
- `updated_at`

#### `moderation_actions`

Immutable moderation log.

Key fields:

- `id uuid pk`
- `actor_id`
- `action_type`
- `target_type`
- `post_id`
- `comment_id`
- `question_id`
- `report_id`
- `reason`
- `metadata`
- `created_at`

#### `attachments`

Metadata only, files live in MinIO.

Key fields:

- `id uuid pk`
- `owner_type`
- `post_id`
- `comment_id`
- `question_id`
- `bucket`
- `object_key`
- `storage_provider`
- `mime_type`
- `size_bytes`
- `checksum`
- `width`
- `height`
- `alt_text`
- `uploaded_by`
- `deleted_at`
- `created_at`

### Indexes

Minimum indexes:

- `community_posts(primary_context_id, status, last_activity_at desc)`
- `community_posts(author_id, created_at desc)`
- `community_post_scopes(context_id, post_id)`
- `community_comments(post_id, parent_comment_id, created_at asc)`
- `community_reports(status, created_at asc)`
- `session_questions(context_id, status, created_at asc)`
- `community_pins(context_id, sort_order, starts_at desc)`

### Soft Delete

Use soft delete for:

- posts
- comments
- questions
- attachments

Keep physical purge as a later background task.

## 4. Access Control

### Roles

- `member` -> maps to backend `student`
- `moderator`
- `admin`
- `speaker_or_host` -> contextual capability, not a global system role

### Capability Rules

#### Member

- read allowed contexts
- create posts
- comment
- reply once
- react
- report
- ask session questions if context permits

#### Speaker/Host

- all member actions
- answer session questions in owned sessions

#### Moderator

- hide/unhide content
- lock/unlock discussions
- pin/unpin
- approve/reject questions
- resolve reports

#### Admin

- all moderator actions
- permanent cleanup tools
- override context rules
- analytics and audit access

### Policy Inputs

Backend access policy must evaluate:

- authenticated user
- normalized roles
- context visibility
- enrollment status
- program/track membership
- future subscription tier

## 5. API Design

### Namespace

- public: `/api/v1/community`
- admin: `/api/v1/admin/community`

### Pagination

Use cursor pagination for:

- feed
- discussions
- questions
- profile activity

Use offset pagination for admin queues only.

### Main Endpoints

#### `GET /api/v1/community/feed`

Query:

- `context_id`
- `kind`
- `cursor`
- `limit`

Returns:

- posts
- author summary
- counts
- viewer state
- `next_cursor`

#### `POST /api/v1/community/posts`

Request:

```json
{
  "kind": "discussion",
  "title": "فوائد من المسار",
  "body": "أكثر نقطة أثرت فيّ اليوم كانت...",
  "primary_context_id": "ctx_track_tazkiya",
  "secondary_context_ids": ["ctx_program_foundation"],
  "attachment_ids": []
}
```

Validation:

- `body` required, 1..4000
- `title` optional, 0..180
- exactly one primary context
- max 3 secondary contexts
- max 4 attachments

#### `GET /api/v1/community/posts/:postId`

Returns:

- post
- scopes
- pin state
- initial comments

#### `POST /api/v1/community/posts/:postId/comments`

Request:

```json
{
  "body": "هذه فائدة جميلة",
  "parent_comment_id": null
}
```

Validation:

- `body` required, 1..2000
- replies allowed only on top-level comments

#### `PUT /api/v1/community/posts/:postId/reaction`

Request:

```json
{
  "reaction_type": "like",
  "active": true
}
```

Idempotent:

- `active=true` creates
- `active=false` removes

#### `PUT /api/v1/community/comments/:commentId/reaction`

Same contract as post reaction.

#### `POST /api/v1/community/reports`

Request:

```json
{
  "target_type": "comment",
  "target_id": "comment_9",
  "reason_code": "abuse",
  "note": "يحتوي على إساءة مباشرة"
}
```

#### `GET /api/v1/community/session-questions`

Query:

- `context_id`
- `status`
- `cursor`
- `limit`

#### `POST /api/v1/community/session-questions`

Request:

```json
{
  "context_id": "ctx_audio_room_live_5",
  "body": "كيف نبدأ حفظ هذا الورد؟",
  "addressed_to_id": "user_speaker_2",
  "is_anonymous": false
}
```

#### `GET /api/v1/community/profiles/:userId/summary`

Returns:

- profile basics
- counts
- recent activity

### Moderation Endpoints

- `GET /api/v1/admin/community/reports`
- `POST /api/v1/admin/community/moderation-actions`
- `POST /api/v1/admin/community/pins`
- `DELETE /api/v1/admin/community/pins/:pinId`
- `PATCH /api/v1/admin/community/session-questions/:questionId`

## 6. Backend Implementation Plan

### Module Layout

```text
backend/src/modules/community/
  community.routes.js
  community.controller.js
  community.service.js
  community.repository.js
  community.policy.js
  validators/
```

### Layer Responsibilities

#### Controller

- request parsing
- response formatting

#### Service

- business rules
- access policy orchestration
- counters
- moderation flows

#### Repository

- SQL
- transactions
- cursor queries

#### Policy

- `canReadContext`
- `canCreatePost`
- `canComment`
- `canAskQuestion`
- `canModerate`

### Validation

Use the same Zod-based validation pattern already present in the backend.

### Error Codes

- `COMMUNITY_CONTEXT_NOT_FOUND`
- `COMMUNITY_ACCESS_DENIED`
- `COMMUNITY_POST_NOT_FOUND`
- `COMMUNITY_COMMENT_DEPTH_EXCEEDED`
- `COMMUNITY_REPORT_DUPLICATE`
- `SESSION_QUESTION_CONTEXT_INVALID`

### Compatibility Rule

Do not grow `/posts` further.

Instead:

1. add `/community/*`
2. migrate mobile
3. migrate web
4. freeze old writes

## 7. Mobile / Frontend Requirements

### Required Screens

- feed screen
- post details
- comments thread
- session discussion screen
- session questions screen
- create post sheet
- community profile tab
- moderator actions sheet

### UX Rules

- default feed = general community
- scope switcher at top
- pinned posts first inside a scope
- optimistic like only
- comments can be optimistic only if local append is safe
- gated contexts show explicit reason, not generic error

### States

#### Empty

- no posts
- no comments
- no questions
- gated scope

#### Loading

- feed skeletons
- inline submit loaders
- cursor pagination spinner

#### Error

- network retry
- unauthorized gate
- moderated content tombstone

## 8. Admin and Moderation

### Admin Dashboard

Add:

- reports inbox
- hidden content list
- pinned posts by context
- open questions queue
- basic metrics

### Appsmith

Use for:

- internal moderation queue
- assignment and resolution
- emergency hide/delete
- audit trail browsing

## 9. Content Integration

### Program and Track

Programs and tracks may still live in Directus, but the backend must mirror them into `community_contexts`.

### Workshop / Session

Each workshop gets:

- discussion context
- questions context

### Audio Room

Each room gets:

- discussion context
- question queue context

### Speaker

Speaker pages can expose a speaker-scoped feed through the same context system.

## 10. Subscription Awareness

Do not implement billing here.

Prepare for it through:

- `community_contexts.visibility`
- `community_contexts.membership_rule`

Examples:

- premium-only scope
- enrolled-course-only discussion
- session questions only for registered attendees

## 11. Technical Guardrails

1. Do not store community business logic in Directus.
2. Do not let frontend write community data directly to Supabase.
3. Do not allow reply depth beyond one level in MVP.
4. Do not use LiveKit chat or workshop messages as discussion persistence.
5. Do not spread polymorphic `entity_type/entity_id` pairs across all tables.
6. Keep context polymorphism bounded in `community_contexts`.
7. Do not hardcode permission logic in mobile or web.
8. Do not mix community posts with notifications or chat tables.
9. Do not let pinning bypass access checks.
10. Do not keep extending legacy `posts/comments/reactions`.

## 12. Phase 1 Delivery Plan

1. Create schema and migration.
2. Build backend community module.
3. Add context registry and access policy.
4. Implement posts/comments/reactions/reports.
5. Implement session questions.
6. Move mobile to `/community/*`.
7. Move web off direct Supabase writes.
8. Add admin and Appsmith moderation views.

## 13. Tech Debt Warnings

- Current web community is still Supabase-coupled.
- Current legacy community tables are too weak for scoped growth.
- Modeling session questions as comments will create messy product semantics.
- Without a context registry, filtering by program/track/session will become a query mess.

## 14. Final Recommendation

Build Community Lite as a backend-owned module with:

- dedicated `community_*` tables
- a context registry
- a separate session question flow
- backend-enforced moderation and access policy

This is the cleanest MVP path that stays practical now and expandable later.
