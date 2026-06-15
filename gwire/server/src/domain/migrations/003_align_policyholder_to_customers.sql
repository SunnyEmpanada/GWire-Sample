-- =============================================================
-- GWire Sample — Align EXTERNAL_SUBMISSIONS policyholder fields
-- to real customer records in CUSTOMERS.
-- Run once in the Supabase SQL editor.
-- policyholder_ssn_last4 and policy_contract_number are unchanged.
-- =============================================================

UPDATE "EXTERNAL_SUBMISSIONS" es
SET
  policyholder_first_name    = split_part(c.display_name, ' ', 1),
  policyholder_last_name     = split_part(c.display_name, ' ', 2),
  policyholder_date_of_birth = c.date_of_birth
FROM "CUSTOMERS" c
WHERE c.customer_id = 'CUST-' || substring(es.submission_id FROM 5);
