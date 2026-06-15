-- =============================================================
-- GWire Sample — Add submission_status to EXTERNAL_SUBMISSIONS
-- Run once in the EXT Supabase SQL editor (secondary DB only).
-- =============================================================

ALTER TABLE "EXTERNAL_SUBMISSIONS"
  ADD COLUMN IF NOT EXISTS submission_status TEXT NOT NULL DEFAULT 'in_review'
  CHECK (submission_status IN ('approved', 'denied', 'in_review'));

-- Backfill existing rows with approved/denied (deterministic by submission number).
-- Even-numbered submissions → approved, odd → denied.
UPDATE "EXTERNAL_SUBMISSIONS"
SET submission_status = CASE
  WHEN MOD(CAST(SUBSTRING(submission_id FROM 5) AS INTEGER), 2) = 0
  THEN 'approved'
  ELSE 'denied'
END
WHERE submission_status = 'in_review';
