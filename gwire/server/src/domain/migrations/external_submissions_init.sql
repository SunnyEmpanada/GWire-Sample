-- =============================================================
-- EXTERNAL_SUBMISSIONS — Standalone Table Init
-- Run once in the target Supabase SQL editor.
-- No foreign keys to any other table.
-- =============================================================

CREATE TABLE IF NOT EXISTS "EXTERNAL_SUBMISSIONS" (
  submission_id                TEXT        PRIMARY KEY,
  submitted_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Submitter (beneficiary)
  relationship_to_deceased     TEXT        NOT NULL
                                 CHECK (relationship_to_deceased IN (
                                   'Allianz Rep/Agent',
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
                                 )),
  first_name                   TEXT        NOT NULL,
  last_name                    TEXT        NOT NULL,
  email                        TEXT        NOT NULL,
  phone_number                 TEXT        NOT NULL,
  address_1                    TEXT        NOT NULL,
  address_2                    TEXT,
  address_3                    TEXT,
  city                         TEXT        NOT NULL,
  state_province               TEXT,
  country                      TEXT        NOT NULL,
  zip_postal_code              TEXT,
  comments                     TEXT,

  -- Policyholder (deceased)
  policyholder_first_name      TEXT        NOT NULL,
  policyholder_last_name       TEXT        NOT NULL,
  date_of_death                DATE        NOT NULL,
  policyholder_date_of_birth   DATE        NOT NULL,
  policyholder_ssn_last4       TEXT        NOT NULL,
  policy_contract_number       TEXT
);

CREATE INDEX IF NOT EXISTS external_submissions_submitted_at_idx
  ON "EXTERNAL_SUBMISSIONS" (submitted_at DESC);
