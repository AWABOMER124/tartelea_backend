-- Tartelea Unified Schema (Production Ready)
-- This script sets up the full database structure for the private server.
-- It is safe to run on existing databases because it uses IF NOT EXISTS
-- and compatibility ALTER statements for newer fields.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --- Enums ---
DO $$ BEGIN
    CREATE TYPE app_role AS ENUM ('member', 'trainer', 'moderator', 'admin', 'guest');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'member';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'moderator';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'guest';

DO $$ BEGIN
    CREATE TYPE content_type AS ENUM ('article', 'audio', 'video');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE content_category AS ENUM ('quran', 'values', 'community', 'sudan_awareness');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TYPE content_category ADD VALUE IF NOT EXISTS 'general';
ALTER TYPE content_category ADD VALUE IF NOT EXISTS 'tahliya';
ALTER TYPE content_category ADD VALUE IF NOT EXISTS 'takhliya';
ALTER TYPE content_category ADD VALUE IF NOT EXISTS 'tajalli';
ALTER TYPE content_category ADD VALUE IF NOT EXISTS 'psychological';
ALTER TYPE content_category ADD VALUE IF NOT EXISTS 'sudan';
ALTER TYPE content_category ADD VALUE IF NOT EXISTS 'arab_awareness';
ALTER TYPE content_category ADD VALUE IF NOT EXISTS 'islamic_awareness';

DO $$ BEGIN
    CREATE TYPE depth_level AS ENUM ('beginner', 'intermediate', 'advanced');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE room_role AS ENUM ('host', 'co_host', 'moderator', 'speaker', 'listener');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TYPE room_role ADD VALUE IF NOT EXISTS 'co_host';

DO $$ BEGIN
    CREATE TYPE hand_raise_status AS ENUM ('pending', 'accepted', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE moderation_status AS ENUM ('pending', 'reviewed', 'resolved', 'dismissed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- --- Core Tables ---

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_verified BOOLEAN DEFAULT false,
    verification_code TEXT,
    reset_token TEXT,
    reset_token_expires TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'active', -- active, suspended, deactivated
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    specialties TEXT[],
    services TEXT[],
    facebook_url TEXT,
    tiktok_url TEXT,
    instagram_url TEXT,
    social_links JSONB DEFAULT '{}'::jsonb,
    country TEXT,
    experience_years INT DEFAULT 0,
    specializations TEXT[] DEFAULT '{}',
    is_public_profile BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role app_role NOT NULL DEFAULT 'member',
    UNIQUE(user_id, role)
);

CREATE TABLE IF NOT EXISTS contents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    type content_type NOT NULL,
    category content_category NOT NULL,
    media_url TEXT,
    thumbnail_url TEXT,
    content TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    access_tier TEXT NOT NULL DEFAULT 'free',
    course_id UUID,
    duration TEXT,
    depth_level INT DEFAULT 1,
    is_sudan_awareness BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT,
    category TEXT DEFAULT 'general',
    image_url TEXT,
    likes_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'like',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    batch_id UUID,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    is_read BOOLEAN DEFAULT false,
    related_post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    related_room_id UUID,
    related_workshop_id UUID,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_role app_role,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    request_ip TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- --- Workshops ---

CREATE TABLE IF NOT EXISTS workshops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    trainer_id UUID NOT NULL REFERENCES users(id),
    host_id UUID REFERENCES users(id),
    category content_category,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    duration INT,
    duration_minutes INT DEFAULT 60,
    recording_url TEXT,
    image_url TEXT,
    is_live BOOLEAN DEFAULT false,
    is_approved BOOLEAN DEFAULT false,
    price NUMERIC(10, 2) DEFAULT 0,
    max_participants INT DEFAULT 100,
    cloudflare_live_input_uid TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workshop_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (workshop_id, user_id)
);

CREATE TABLE IF NOT EXISTS workshop_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workshop_recordings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
    recording_url TEXT,
    duration_seconds INT,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_available BOOLEAN DEFAULT false,
    cloudflare_uid TEXT
);

CREATE TABLE IF NOT EXISTS trainer_courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trainer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    category content_category DEFAULT 'general',
    thumbnail_url TEXT,
    media_url TEXT,
    price NUMERIC(10, 2) DEFAULT 0,
    is_approved BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pinned_content (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    thumbnail_url TEXT,
    sort_order INT DEFAULT 0,
    pinned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- --- Rooms ---

CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    slug TEXT NOT NULL DEFAULT ('session-' || uuid_generate_v4()::text),
    description TEXT,
    host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category content_category,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    duration_minutes INT DEFAULT 30,
    is_live BOOLEAN DEFAULT false,
    is_approved BOOLEAN DEFAULT false,
    price NUMERIC(10, 2) DEFAULT 0,
    max_participants INT DEFAULT 50,
    access_type TEXT DEFAULT 'public',
    image_url TEXT,
    actual_started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS room_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS room_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role room_role NOT NULL DEFAULT 'listener',
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS room_hand_raises (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status hand_raise_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS room_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    details TEXT,
    status moderation_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS room_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- --- Legacy Audio Rooms ---

CREATE TABLE IF NOT EXISTS audio_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    status TEXT DEFAULT 'idle',
    participants_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audio_room_participants (
    room_id UUID NOT NULL REFERENCES audio_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'listener',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    left_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (room_id, user_id)
);

-- --- Billing / Publishing ---

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    plan_name TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    end_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monthly_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    paypal_subscription_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blog_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    excerpt TEXT,
    content TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_published BOOLEAN NOT NULL DEFAULT false,
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES trainer_courses(id) ON DELETE CASCADE,
    subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS course_ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES trainer_courses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (course_id, user_id)
);

CREATE TABLE IF NOT EXISTS course_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES trainer_courses(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    parent_id UUID REFERENCES course_comments(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES trainer_courses(id) ON DELETE CASCADE,
    progress_percent INT NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
    completed_at TIMESTAMP WITH TIME ZONE,
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS certificates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES trainer_courses(id) ON DELETE CASCADE,
    certificate_number TEXT NOT NULL UNIQUE,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS course_chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES trainer_courses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    attachment_url TEXT,
    attachment_type TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS direct_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trainer_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trainer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    service_type TEXT NOT NULL DEFAULT 'private_session',
    duration_minutes INT DEFAULT 60,
    price NUMERIC(10, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id UUID NOT NULL REFERENCES trainer_services(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trainer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES service_bookings(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES trainer_services(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trainer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (booking_id)
);

CREATE TABLE IF NOT EXISTS trainer_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trainer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trainer_blocked_dates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trainer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_date DATE NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (trainer_id, blocked_date)
);

CREATE TABLE IF NOT EXISTS room_recordings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    recording_url TEXT,
    duration_seconds INT,
    file_size_bytes BIGINT,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_available BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'android',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, token)
);

CREATE TABLE IF NOT EXISTS chat_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    message_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, usage_date)
);

CREATE TABLE IF NOT EXISTS post_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    details TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (post_id, reporter_id)
);

-- --- Compatibility Alters For Existing Databases ---

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS specialties TEXT[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS services TEXT[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS facebook_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tiktok_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS instagram_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}'::jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS experience_years INT DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS specializations TEXT[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_public_profile BOOLEAN DEFAULT false;

ALTER TABLE contents ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS access_tier TEXT NOT NULL DEFAULT 'free';
ALTER TABLE contents ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES trainer_courses(id) ON DELETE SET NULL;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS duration TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS depth_level INT DEFAULT 1;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS is_sudan_awareness BOOLEAN DEFAULT false;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS url TEXT;

ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS likes_count INT DEFAULT 0;

ALTER TABLE workshops ADD COLUMN IF NOT EXISTS host_id UUID REFERENCES users(id);
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS category content_category;
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS duration_minutes INT DEFAULT 60;
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false;
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS max_participants INT DEFAULT 100;
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS cloudflare_live_input_uid TEXT;
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS batch_id UUID,
    ADD COLUMN IF NOT EXISTS related_room_id UUID,
    ADD COLUMN IF NOT EXISTS related_workshop_id UUID;

ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS request_ip TEXT;
ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb;
ALTER TABLE user_roles ALTER COLUMN role SET DEFAULT 'member';

-- rooms.host_id was introduced as the source of truth for session ownership.
-- Some older databases may have a legacy `created_by` column instead; we backfill when present.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS host_id UUID REFERENCES users(id) ON DELETE CASCADE;
DO $$ BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'rooms'
          AND column_name = 'created_by'
    ) THEN
        EXECUTE '
            UPDATE rooms
            SET host_id = created_by
            WHERE host_id IS NULL
              AND created_by IS NOT NULL
        ';
    END IF;
END $$;

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS category content_category;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS duration_minutes INT DEFAULT 30;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_live BOOLEAN DEFAULT false;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS max_participants INT DEFAULT 50;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS access_type TEXT DEFAULT 'public';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS actual_started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS peak_participants INT DEFAULT 0;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS total_participants_count INT DEFAULT 0;

ALTER TABLE trainer_courses ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE trainer_courses ADD COLUMN IF NOT EXISTS category content_category DEFAULT 'general';
ALTER TABLE trainer_courses ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE trainer_courses ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE trainer_courses ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE trainer_courses ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false;
ALTER TABLE trainer_courses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE trainer_courses ADD COLUMN IF NOT EXISTS type content_type DEFAULT 'video';
ALTER TABLE trainer_courses ADD COLUMN IF NOT EXISTS depth_level depth_level DEFAULT 'beginner';
ALTER TABLE trainer_courses ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE trainer_courses ADD COLUMN IF NOT EXISTS views_count INT DEFAULT 0;

ALTER TABLE pinned_content ADD COLUMN IF NOT EXISTS subtitle TEXT;
ALTER TABLE pinned_content ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE pinned_content ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;
ALTER TABLE pinned_content ADD COLUMN IF NOT EXISTS pinned_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- --- Community Lite ---

DO $$ BEGIN
    CREATE TYPE community_context_type AS ENUM ('general', 'program', 'track', 'course', 'workshop', 'audio_room', 'speaker');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE community_visibility AS ENUM ('public', 'authenticated', 'members_only', 'premium_only', 'program_enrolled', 'track_enrolled', 'session_registered');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE community_post_kind AS ENUM ('discussion', 'announcement');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE community_content_status AS ENUM ('published', 'hidden', 'deleted', 'archived');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE community_reaction_type AS ENUM ('like');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE community_reaction_target_type AS ENUM ('post', 'comment');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE community_report_target_type AS ENUM ('post', 'comment', 'question');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE community_report_reason AS ENUM ('spam', 'abuse', 'off_topic', 'misinformation', 'copyright', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE session_question_status AS ENUM ('pending', 'approved', 'answered', 'rejected', 'archived');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE moderation_action_type AS ENUM ('hide', 'unhide', 'delete', 'restore', 'lock', 'unlock', 'pin', 'unpin', 'approve_question', 'reject_question', 'answer_question', 'resolve_report', 'dismiss_report');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE attachment_owner_type AS ENUM ('post', 'comment', 'question');
EXCEPTION
    WHEN duplicate_object THEN null;
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
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (context_type, source_system, source_id)
);

CREATE TABLE IF NOT EXISTS community_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    primary_context_id UUID NOT NULL REFERENCES community_contexts(id) ON DELETE RESTRICT,
    kind community_post_kind NOT NULL DEFAULT 'discussion',
    title VARCHAR(180),
    body TEXT NOT NULL,
    status community_content_status NOT NULL DEFAULT 'published',
    visibility_override community_visibility,
    is_locked BOOLEAN NOT NULL DEFAULT false,
    comments_count INT NOT NULL DEFAULT 0,
    reactions_count INT NOT NULL DEFAULT 0,
    attachments_count INT NOT NULL DEFAULT 0,
    last_activity_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    edited_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_post_scopes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    context_id UUID NOT NULL REFERENCES community_contexts(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (post_id, context_id)
);

CREATE TABLE IF NOT EXISTS community_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    parent_comment_id UUID REFERENCES community_comments(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    depth SMALLINT NOT NULL DEFAULT 0 CHECK (depth IN (0, 1)),
    body TEXT NOT NULL,
    status community_content_status NOT NULL DEFAULT 'published',
    replies_count INT NOT NULL DEFAULT 0,
    reactions_count INT NOT NULL DEFAULT 0,
    edited_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
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
    is_anonymous BOOLEAN NOT NULL DEFAULT false,
    answer_text TEXT,
    answered_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    answered_at TIMESTAMP WITH TIME ZONE,
    approved_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    rejected_reason TEXT,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type community_reaction_target_type NOT NULL,
    post_id UUID REFERENCES community_posts(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES community_comments(id) ON DELETE CASCADE,
    reaction_type community_reaction_type NOT NULL DEFAULT 'like',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CHECK (
        (post_id IS NOT NULL AND comment_id IS NULL AND target_type = 'post')
        OR
        (post_id IS NULL AND comment_id IS NOT NULL AND target_type = 'comment')
    )
);

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
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_note TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CHECK (((post_id IS NOT NULL)::int + (comment_id IS NOT NULL)::int + (question_id IS NOT NULL)::int) = 1)
);

CREATE TABLE IF NOT EXISTS community_pins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    context_id UUID NOT NULL REFERENCES community_contexts(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    pinned_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reason TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
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
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
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
    width INT,
    height INT,
    alt_text TEXT,
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CHECK (((post_id IS NOT NULL)::int + (comment_id IS NOT NULL)::int + (question_id IS NOT NULL)::int) = 1)
);

CREATE OR REPLACE VIEW profiles_public AS
SELECT
    id,
    full_name,
    avatar_url,
    bio,
    country,
    experience_years,
    is_public_profile,
    false::boolean AS is_sudan_awareness_member,
    specializations,
    created_at
FROM profiles
WHERE COALESCE(is_public_profile, false) = true;

CREATE OR REPLACE VIEW course_ratings_public AS
SELECT course_id, rating, created_at
FROM course_ratings;

CREATE OR REPLACE VIEW course_subscriptions_public AS
SELECT course_id, COUNT(*)::int AS subscriber_count
FROM course_subscriptions
GROUP BY course_id;

-- --- Indexes ---

CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_subscriptions_active_user
    ON monthly_subscriptions (user_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_contents_category_type ON contents(category, type);
CREATE INDEX IF NOT EXISTS idx_workshops_scheduled_at ON workshops(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_rooms_scheduled_at ON rooms(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created_at ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_batch_id ON notifications(batch_id);
CREATE INDEX IF NOT EXISTS idx_trainer_courses_approved_created_at ON trainer_courses(is_approved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_subscriptions_course_id ON course_subscriptions(course_id);
CREATE INDEX IF NOT EXISTS idx_course_progress_user_course ON course_progress(user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_course_chat_messages_course_created ON course_chat_messages(course_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_direct_messages_participants_created ON direct_messages(sender_id, receiver_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_trainer_services_trainer_active ON trainer_services(trainer_id, is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_bookings_owner_dates ON service_bookings(trainer_id, student_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_trainer_availability_trainer_day ON trainer_availability(trainer_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_trainer_blocked_dates_trainer_date ON trainer_blocked_dates(trainer_id, blocked_date);
CREATE INDEX IF NOT EXISTS idx_room_recordings_room_recorded ON room_recordings(room_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_updated ON device_tokens(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_usage_user_date ON chat_usage(user_id, usage_date DESC);
CREATE INDEX IF NOT EXISTS idx_post_reports_post_status_created ON post_reports(post_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pinned_content_sort_order ON pinned_content(sort_order ASC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor_created_at ON admin_audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity ON admin_audit_logs(entity_type, entity_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_post_scopes_primary_post ON community_post_scopes(post_id) WHERE is_primary = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_reactions_post_unique ON community_reactions(user_id, post_id, reaction_type) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_reactions_comment_unique ON community_reactions(user_id, comment_id, reaction_type) WHERE comment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_community_posts_context_activity ON community_posts(primary_context_id, status, last_activity_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_author_created ON community_posts(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_post_scopes_context ON community_post_scopes(context_id, post_id);
CREATE INDEX IF NOT EXISTS idx_community_comments_post_parent_created ON community_comments(post_id, parent_comment_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_community_reports_status_created ON community_reports(status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_session_questions_context_status_created ON session_questions(context_id, status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_community_pins_context_sort ON community_pins(context_id, sort_order ASC, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_attachments_post ON attachments(post_id) WHERE post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attachments_comment ON attachments(comment_id) WHERE comment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attachments_question ON attachments(question_id) WHERE question_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor_created_at ON admin_audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity ON admin_audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- --- Initial Seed Data ---
-- Insert a test trainer account (password: 123456)
-- Note: In production, hash the password before inserting.
-- INSERT INTO users (email, password_hash) VALUES ('test@tartelea.com', '$2a$10$xyz...');

-- --- Subscription System (STEP 4) ---

CREATE TABLE IF NOT EXISTS subscription_entitlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    billing_period TEXT NOT NULL,
    price NUMERIC(10, 2) DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscription_plan_entitlements (
    plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    entitlement_id UUID NOT NULL REFERENCES subscription_entitlements(id) ON DELETE CASCADE,
    PRIMARY KEY (plan_id, entitlement_id)
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_code TEXT NOT NULL REFERENCES subscription_plans(code),
    status TEXT NOT NULL DEFAULT 'active',
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMP WITH TIME ZONE,
    source TEXT NOT NULL DEFAULT 'manual',
    provider TEXT,
    provider_reference TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_entitlement_overrides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entitlement_code TEXT NOT NULL REFERENCES subscription_entitlements(code),
    effect TEXT NOT NULL DEFAULT 'grant', -- 'grant' or 'revoke'
    reason TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- --- Subscriptions Indexes ---
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_status ON user_subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_plan_status ON user_subscriptions(user_id, plan_code, status);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_dates ON user_subscriptions(starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_user_entitlement_overrides_user ON user_entitlement_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_user_entitlement_overrides_user_entitlement ON user_entitlement_overrides(user_id, entitlement_code);

INSERT INTO subscription_entitlements (code, description)
VALUES
    ('access_public_community', 'Allows community participation in public and standard member areas.'),
    ('access_free_library', 'Allows access to the free library catalog.'),
    ('access_full_library', 'Allows access to the premium/full library catalog.'),
    ('access_public_rooms', 'Allows joining public audio rooms.'),
    ('access_all_rooms', 'Allows joining all room tiers, including premium rooms.'),
    ('create_rooms', 'Allows creating community audio rooms.'),
    ('access_specific_course', 'Allows access to a specific course scope carried in metadata.course_id.'),
    ('discount_courses_25', 'Allows a 25 percent discount on eligible courses.'),
    ('host_sessions', 'Allows hosting and managing official live sessions.'),
    ('admin_platform', 'Bypass entitlement gates across the platform.')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO subscription_plans (code, name, billing_period, price, currency, is_active)
VALUES
    ('free', 'Free', 'none', 0, 'USD', true),
    ('monthly', 'Monthly', 'monthly', 29, 'USD', true),
    ('student', 'Student', 'scoped', 0, 'USD', true)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    billing_period = EXCLUDED.billing_period,
    price = EXCLUDED.price,
    currency = EXCLUDED.currency,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

INSERT INTO subscription_plan_entitlements (plan_id, entitlement_id)
SELECT p.id, e.id
FROM subscription_plans p
JOIN subscription_entitlements e ON (
    (p.code = 'free' AND e.code IN ('access_public_community', 'access_free_library', 'access_public_rooms'))
    OR
    (p.code = 'monthly' AND e.code IN ('access_public_community', 'access_free_library', 'access_full_library', 'access_all_rooms', 'create_rooms', 'discount_courses_25'))
    OR
    (p.code = 'student' AND e.code IN ('access_free_library', 'access_specific_course'))
)
ON CONFLICT (plan_id, entitlement_id) DO NOTHING;
