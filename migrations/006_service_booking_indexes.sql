CREATE INDEX IF NOT EXISTS idx_service_bookings_trainer_schedule
  ON service_bookings (trainer_id, scheduled_at)
  WHERE status IN ('pending', 'confirmed');

CREATE INDEX IF NOT EXISTS idx_service_bookings_student_schedule
  ON service_bookings (student_id, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_reviews_trainer_created
  ON service_reviews (trainer_id, created_at DESC);
