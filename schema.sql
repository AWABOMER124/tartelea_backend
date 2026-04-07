-- Tartelea Unified Schema (Production Ready)
-- This script sets up the entire database structure for the private server.

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

-- --- Tables ---

-- Users Table (Authentication)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    specialties TEXT[], -- disciplines
    services TEXT[],
    facebook_url TEXT,
    tiktok_url TEXT,
    instagram_url TEXT,
    country TEXT, -- Added country field found in React app
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Roles Table (to match React Admin Dashboard)
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role app_role NOT NULL DEFAULT 'student',
    UNIQUE(user_id, role)
);

-- Contents Table (Library)
CREATE TABLE IF NOT EXISTS contents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    type content_type NOT NULL,
    category content_category NOT NULL,
    media_url TEXT, -- Path to file in backend/uploads
    thumbnail_url TEXT,
    duration TEXT, -- formatted as "MM:SS" or "HH:MM:SS"
    is_sudan_awareness BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Posts Table (Community)
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

-- Comments Table
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workshops Table
CREATE TABLE IF NOT EXISTS workshops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    trainer_id UUID NOT NULL REFERENCES users(id),
    scheduled_at TIMESTAMP WITH TIME ZONE,
    duration INT, -- in minutes
    recording_url TEXT,
    is_live BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audio Rooms
CREATE TABLE IF NOT EXISTS audio_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    status TEXT DEFAULT 'idle', -- 'idle', 'live'
    participants_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    plan_name TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    end_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- --- Initial Seed Data ---
-- Insert a test trainer account (password: 123456)
-- Note: In production, hash the password before inserting.
-- INSERT INTO users (email, password_hash) VALUES ('test@tartelea.com', '$2a$10$xyz...');
