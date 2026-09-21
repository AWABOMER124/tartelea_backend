CREATE INDEX IF NOT EXISTS idx_room_recordings_room_recorded
  ON room_recordings (room_id, recorded_at DESC)
  WHERE is_available = TRUE;
