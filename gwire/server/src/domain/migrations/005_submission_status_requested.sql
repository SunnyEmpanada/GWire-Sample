-- =============================================================
-- GWire Sample — Allow submission_status 'requested' for web form submissions
-- Run once in the EXT Supabase SQL editor (secondary DB only).
-- =============================================================

ALTER TABLE "EXTERNAL_SUBMISSIONS"
  DROP CONSTRAINT IF EXISTS "EXTERNAL_SUBMISSIONS_submission_status_check";

ALTER TABLE "EXTERNAL_SUBMISSIONS"
  ADD CONSTRAINT "EXTERNAL_SUBMISSIONS_submission_status_check"
  CHECK (submission_status IN ('approved', 'denied', 'in_review', 'requested'));
