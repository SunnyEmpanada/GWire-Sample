-- =============================================================
-- GWire Sample — Rename Allianz Rep/Agent relationship option to Life Inc.
-- Run once in the EXT Supabase SQL editor (secondary DB only).
-- =============================================================

UPDATE "EXTERNAL_SUBMISSIONS"
SET relationship_to_deceased = 'Life Inc. Rep/Agent'
WHERE relationship_to_deceased = 'Allianz Rep/Agent';

ALTER TABLE "EXTERNAL_SUBMISSIONS"
  DROP CONSTRAINT IF EXISTS "EXTERNAL_SUBMISSIONS_relationship_to_deceased_check";

ALTER TABLE "EXTERNAL_SUBMISSIONS"
  ADD CONSTRAINT "EXTERNAL_SUBMISSIONS_relationship_to_deceased_check"
  CHECK (relationship_to_deceased IN (
    'Life Inc. Rep/Agent',
    'Child',
    'Custodial Company Plan Administrator',
    'Executor of the Estate',
    'Family Member',
    'Financial Advisor',
    'Friend',
    'Grandchild',
    'Other',
    'Pension Administrator',
    'Policy Owner',
    'Rep of a Charitable Organization',
    'Sibling',
    'Significant Other',
    'Spouse',
    'Trustee'
  ));
