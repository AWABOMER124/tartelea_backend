-- Tartelea Unified Schema (Production Ready)
-- This script sets up the full database structure for the private server.
-- It is safe to run on existing databases because it uses IF NOT EXISTS
-- and compatibility ALTER statements for newer fields.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --- Enums ---
DO $$ BEGIN
    CREATE TYPE app_role AS ENUM ('student', 'trainer', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

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

DO $$ BEGIN
    CREATE TYPE room_role AS ENUM ('host', 'co_host', 'moderator', 'speaker', 'listener');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

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
    role app_role NOT NULL DEFAULT 'student',
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
    duration TEXT,
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

-- --- Rooms ---

CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category content_category,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    duration_minutes INT DEFAULT 30,
    is_live BOOLEAN DEFAULT false,
    is_approved BOOLEAN DEFAULT false,
    price NUMERIC(10, 2) DEFAULT 0,
    max_participants INT DEFAULT 50,
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

-- --- Compatibility Alters For Existing Databases ---

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP WITH TIME ZONE;

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
ALTER TABLE contents ADD COLUMN IF NOT EXISTS duration TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS is_sudan_awareness BOOLEAN DEFAULT false;

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
    ADD COLUMN IF NOT EXISTS related_room_id UUID,
    ADD COLUMN IF NOT EXISTS related_workshop_id UUID;

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS duration_minutes INT DEFAULT 30;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_live BOOLEAN DEFAULT false;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS max_participants INT DEFAULT 50;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

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

-- --- Initial Seed Data ---
-- Insert a test trainer account (password: 123456)
-- Note: In production, hash the password before inserting.
-- INSERT INTO users (email, password_hash) VALUES ('test@tartelea.com', '$2a$10$xyz...');
