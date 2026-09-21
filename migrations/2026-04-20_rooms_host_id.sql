-- Purpose: Fix production sessions by ensuring `rooms.host_id` exists.
-- Safe to run multiple times.

-- 1) Add column (nullable)
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS host_id UUID;

-- 2) Clear orphaned host references left by older schemas/data.
-- Keep the room row; only null the incompatible reference so the FK can be added safely.
UPDATE rooms r
SET host_id = NULL
WHERE host_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM users u
    WHERE u.id = r.host_id
  );

-- 3) Backfill from legacy `created_by` only when it references an existing user.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'rooms'
      AND column_name = 'created_by'
  ) THEN
    EXECUTE '
      UPDATE rooms r
      SET host_id = r.created_by
      WHERE r.host_id IS NULL
        AND r.created_by IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM users u
          WHERE u.id = r.created_by
        )
    ';
  END IF;
END $$;

-- 4) Add FK constraint in a low-risk way (NOT VALID then validate)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rooms_host_id_fkey'
  ) THEN
    ALTER TABLE rooms
      ADD CONSTRAINT rooms_host_id_fkey
      FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE
      NOT VALID;

    ALTER TABLE rooms
      VALIDATE CONSTRAINT rooms_host_id_fkey;
  END IF;
END $$;
