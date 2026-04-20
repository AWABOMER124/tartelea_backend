-- Purpose: Ensure rooms.livekit_room exists and is non-null for LiveKit sessions.
-- Safe to run multiple times.

-- 1) Add the column if missing (defaulting to TEXT).
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS livekit_room TEXT;

-- 2) Make default + backfill resilient even if the column type differs across environments.
DO $$
DECLARE
  livekit_udt TEXT;
BEGIN
  SELECT c.udt_name
  INTO livekit_udt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'rooms'
    AND c.column_name = 'livekit_room'
  LIMIT 1;

  IF livekit_udt = 'uuid' THEN
    EXECUTE 'ALTER TABLE rooms ALTER COLUMN livekit_room SET DEFAULT uuid_generate_v4()';
    EXECUTE 'UPDATE rooms SET livekit_room = uuid_generate_v4() WHERE livekit_room IS NULL';
  ELSE
    EXECUTE 'ALTER TABLE rooms ALTER COLUMN livekit_room SET DEFAULT (uuid_generate_v4()::text)';
    EXECUTE 'UPDATE rooms SET livekit_room = (uuid_generate_v4()::text) WHERE livekit_room IS NULL';
  END IF;

  EXECUTE 'ALTER TABLE rooms ALTER COLUMN livekit_room SET NOT NULL';
END $$;
