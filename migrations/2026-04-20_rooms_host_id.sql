-- Purpose: Fix production sessions by ensuring `rooms.host_id` exists.
-- Safe to run multiple times.
-- 1) Add column (nullable)
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS host_id UUID;

-- 2) Backfill from legacy `created_by` if that column exists
DO $$
BEGIN
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

-- 3) Add FK constraint in a low-risk way (NOT VALID then validate)
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

