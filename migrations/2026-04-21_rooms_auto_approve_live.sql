-- Purpose: Ensure live rooms are visible to all users by auto-approving live sessions.
-- Safe to run multiple times.

UPDATE rooms
SET is_approved = TRUE,
    updated_at = NOW()
WHERE COALESCE(is_approved, FALSE) = FALSE
  AND COALESCE(is_live, FALSE) = TRUE
  AND ended_at IS NULL;

