-- =============================================================
-- GWire Sample — Data Corrections for EXTERNAL_SUBMISSIONS
-- Run once in the Supabase SQL editor.
-- =============================================================

-- 1. Align beneficiary names with LIFE_POLICIES.
--    SUB-NNNNN maps to LIFE-NNNNN by numeric portion.
UPDATE "EXTERNAL_SUBMISSIONS" es
SET
  first_name = split_part(lp.beneficiary_name, ' ', 1),
  last_name  = split_part(lp.beneficiary_name, ' ', 2)
FROM "LIFE_POLICIES" lp
WHERE lp.policy_id = 'LIFE-' || substring(es.submission_id FROM 5);

-- 2. Inject incorrect policyholder_ssn_last4 for 10 submissions.
--    Adds a fixed +1111 offset (wraps within 1000–9999) so values look
--    plausible but don't match the policyholder's actual record.
UPDATE "EXTERNAL_SUBMISSIONS"
SET policyholder_ssn_last4 =
  lpad(((policyholder_ssn_last4::int - 1000 + 1111) % 9000 + 1000)::text, 4, '0')
WHERE submission_id IN (
  'SUB-00003', 'SUB-00006', 'SUB-00009', 'SUB-00011', 'SUB-00013',
  'SUB-00015', 'SUB-00017', 'SUB-00019', 'SUB-00021', 'SUB-00024'
);
