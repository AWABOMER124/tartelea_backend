-- Align trainer_courses with the fields used by the trainer and admin applications.
ALTER TABLE trainer_courses
  ADD COLUMN IF NOT EXISTS type content_type NOT NULL DEFAULT 'video';

ALTER TABLE trainer_courses
  ADD COLUMN IF NOT EXISTS depth_level depth_level NOT NULL DEFAULT 'beginner';

ALTER TABLE trainer_courses
  ADD COLUMN IF NOT EXISTS url TEXT;

ALTER TABLE trainer_courses
  ADD COLUMN IF NOT EXISTS views_count INT NOT NULL DEFAULT 0;
