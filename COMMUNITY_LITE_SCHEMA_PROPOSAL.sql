-- Community Lite schema proposal
-- This proposal intentionally does not extend the legacy posts/comments/reactions tables.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
  CREATE TYPE community_context_type AS ENUM (
    'general',
    'program',
    'track',
    'course',
    'workshop',
    'audio_room',
    'speaker'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE community_visibility AS ENUM (
    'public',
    'authenticated',
    'members_only',
    'premium_only',
    'program_enrolled',
    'track_enrolled',
    'session_registered'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE community_post_kind AS ENUM ('discussion', 'announcement');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE community_content_status AS ENUM ('published', 'hidden', 'deleted', 'archived');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE community_reaction_type AS ENUM ('like');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE community_reaction_target_type AS ENUM ('post', 'comment');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE community_report_target_type AS ENUM ('post', 'comment', 'question');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE community_report_reason AS ENUM (
    'spam',
    'abuse',
    'off_topic',
    'misinformation',
    'copyright',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE session_question_status AS ENUM (
    'pending',
    'approved',
    'answered',
    'rejected',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE moderation_action_type AS ENUM (
    'hide',
    'unhide',
    'delete',
    'restore',
    'lock',
    'unlock',
    'pin',
    'unpin',
    'approve_question',
    'reject_question',
    'answer_question',
    'resolve_report',
    'dismiss_report'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE attachment_owner_type AS ENUM ('post', 'comment', 'question');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS community_contexts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  context_type community_context_type NOT NULL,
  source_system TEXT NOT NULL,
  source_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  visibility community_visibility NOT NULL DEFAULT 'authenticated',
  membership_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (context_type, source_system, source_id)
);

CREATE TABLE IF NOT EXISTS community_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  primary_context_id UUID NOT NULL REFERENCES community_contexts(id) ON DELETE RESTRICT,
  kind community_post_kind NOT NULL,
  title VARCHAR(180),
  body TEXT NOT NULL,
  status community_content_status NOT NULL DEFAULT 'published',
  visibility_override community_visibility,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  comments_count INTEGER NOT NULL DEFAULT 0,
  reactions_count INTEGER NOT NULL DEFAULT 0,
  attachments_count INTEGER NOT NULL DEFAULT 0,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_post_scopes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  context_id UUID NOT NULL REFERENCES community_contexts(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, context_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS community_post_scopes_primary_post_idx
  ON community_post_scopes (post_id)
  WHERE is_primary = TRUE;

CREATE TABLE IF NOT EXISTS community_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES community_comments(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  depth SMALLINT NOT NULL DEFAULT 0 CHECK (depth IN (0, 1)),
  body TEXT NOT NULL,
  status community_content_status NOT NULL DEFAULT 'published',
  replies_count INTEGER NOT NULL DEFAULT 0,
  reactions_count INTEGER NOT NULL DEFAULT 0,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (parent_comment_id IS NULL AND depth = 0)
    OR
    (parent_comment_id IS NOT NULL AND depth = 1)
  )
);

CREATE TABLE IF NOT EXISTS session_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  context_id UUID NOT NULL REFERENCES community_contexts(id) ON DELETE RESTRICT,
  asked_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  addressed_to_id UUID REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  status session_question_status NOT NULL DEFAULT 'pending',
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  answer_text TEXT,
  answered_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  answered_at TIMESTAMPTZ,
  approved_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type community_reaction_target_type NOT NULL,
  post_id UUID REFERENCES community_posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES community_comments(id) ON DELETE CASCADE,
  reaction_type community_reaction_type NOT NULL DEFAULT 'like',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (post_id IS NOT NULL AND comment_id IS NULL AND target_type = 'post')
    OR
    (post_id IS NULL AND comment_id IS NOT NULL AND target_type = 'comment')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS community_reactions_post_unique_idx
  ON community_reactions (user_id, post_id, reaction_type)
  WHERE post_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS community_reactions_comment_unique_idx
  ON community_reactions (user_id, comment_id, reaction_type)
  WHERE comment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS community_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  target_type community_report_target_type NOT NULL,
  post_id UUID REFERENCES community_posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES community_comments(id) ON DELETE CASCADE,
  question_id UUID REFERENCES session_questions(id) ON DELETE CASCADE,
  reason_code community_report_reason NOT NULL,
  note TEXT,
  status moderation_status NOT NULL DEFAULT 'pending',
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    ((post_id IS NOT NULL)::int + (comment_id IS NOT NULL)::int + (question_id IS NOT NULL)::int) = 1
  )
);

CREATE TABLE IF NOT EXISTS community_pins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  context_id UUID NOT NULL REFERENCES community_contexts(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  pinned_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (context_id, post_id)
);

CREATE TABLE IF NOT EXISTS moderation_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action_type moderation_action_type NOT NULL,
  target_type community_report_target_type NOT NULL,
  post_id UUID REFERENCES community_posts(id) ON DELETE SET NULL,
  comment_id UUID REFERENCES community_comments(id) ON DELETE SET NULL,
  question_id UUID REFERENCES session_questions(id) ON DELETE SET NULL,
  report_id UUID REFERENCES community_reports(id) ON DELETE SET NULL,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_type attachment_owner_type NOT NULL,
  post_id UUID REFERENCES community_posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES community_comments(id) ON DELETE CASCADE,
  question_id UUID REFERENCES session_questions(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  object_key TEXT NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'minio',
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  checksum TEXT,
  width INTEGER,
  height INTEGER,
  alt_text TEXT,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    ((post_id IS NOT NULL)::int + (comment_id IS NOT NULL)::int + (question_id IS NOT NULL)::int) = 1
  )
);

CREATE INDEX IF NOT EXISTS community_posts_context_activity_idx
  ON community_posts (primary_context_id, status, last_activity_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS community_posts_author_created_idx
  ON community_posts (author_id, created_at DESC);

CREATE INDEX IF NOT EXISTS community_post_scopes_context_idx
  ON community_post_scopes (context_id, post_id);

CREATE INDEX IF NOT EXISTS community_comments_post_parent_created_idx
  ON community_comments (post_id, parent_comment_id, created_at ASC);

CREATE INDEX IF NOT EXISTS community_reports_status_created_idx
  ON community_reports (status, created_at ASC);

CREATE INDEX IF NOT EXISTS session_questions_context_status_created_idx
  ON session_questions (context_id, status, created_at ASC);

CREATE INDEX IF NOT EXISTS community_pins_context_sort_idx
  ON community_pins (context_id, sort_order ASC, starts_at DESC);

CREATE INDEX IF NOT EXISTS attachments_post_idx
  ON attachments (post_id)
  WHERE post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS attachments_comment_idx
  ON attachments (comment_id)
  WHERE comment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS attachments_question_idx
  ON attachments (question_id)
  WHERE question_id IS NOT NULL;
