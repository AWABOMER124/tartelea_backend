-- Purpose: Ensure rooms.livekit_room exists and is non-null for LiveKit sessions.
-- Safe to run multiple times.

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS livekit_room TEXT;

-- Provide a safe default even if older backend versions did not send a LiveKit room name.
ALTER TABLE rooms
  ALTER COLUMN livekit_room SET DEFAULT ('room_' || uuid_generate_v4()::text);

-- Backfill existing rows (if any) that were created before livekit_room became required.
UPDATE rooms
SET livekit_room = ('room_' || uuid_generate_v4()::text)
WHERE livekit_room IS NULL;

ALTER TABLE rooms
  ALTER COLUMN livekit_room SET NOT NULL;

