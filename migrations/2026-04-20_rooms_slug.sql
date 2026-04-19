-- Purpose: Ensure rooms.slug exists and is non-null for session creation.
-- Safe to run multiple times.

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS slug TEXT;

-- Provide a safe default even if older backend versions did not send a slug.
ALTER TABLE rooms
  ALTER COLUMN slug SET DEFAULT ('session-' || uuid_generate_v4()::text);

-- Backfill existing rows (if any) that were created before slug became required.
UPDATE rooms
SET slug = ('session-' || uuid_generate_v4()::text)
WHERE slug IS NULL;

ALTER TABLE rooms
  ALTER COLUMN slug SET NOT NULL;

