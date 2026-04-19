-- Purpose: Bring older production databases in sync with the sessions/rooms schema.
-- Safe to run multiple times.

-- 1) Ensure the enum supports the co-host role (older DBs had no `co_host`)
ALTER TYPE room_role ADD VALUE IF NOT EXISTS 'co_host';

-- 2) Ensure rooms has the columns required by SessionService.createSession + listing
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS category content_category;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS access_type TEXT DEFAULT 'public';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS duration_minutes INT DEFAULT 30;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_live BOOLEAN DEFAULT false;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS max_participants INT DEFAULT 50;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS actual_started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

