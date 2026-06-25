-- =============================================================
-- GWire Sample — Initial Supabase Tables
-- Run once in the Supabase SQL editor (idempotent via IF NOT EXISTS).
-- Does NOT alter the existing policy_risks table.
-- Table names are uppercase and double-quoted for case-sensitivity.
-- =============================================================

-- 1. CUSTOMERS
CREATE TABLE IF NOT EXISTS "CUSTOMERS" (
  customer_id    TEXT        PRIMARY KEY,
  display_name   TEXT        NOT NULL,
  primary_email  TEXT        NOT NULL,
  primary_phone  TEXT        NOT NULL,
  account_number TEXT        NOT NULL,
  ssn            TEXT        NOT NULL,
  date_of_birth  DATE        NOT NULL,
  gender         TEXT        NOT NULL CHECK (gender IN ('M', 'F')),
  tobacco_use    BOOLEAN     NOT NULL DEFAULT FALSE,
  address_line1  TEXT        NOT NULL,
  city           TEXT        NOT NULL,
  county         TEXT        NOT NULL,
  state_prov_cd  TEXT        NOT NULL DEFAULT 'CA',
  postal_code    TEXT        NOT NULL,
  country_cd     TEXT        NOT NULL DEFAULT 'US',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customers_primary_email_idx ON "CUSTOMERS" (primary_email);

-- 2. HOME_POLICIES (POL-00001–POL-00050, lineCd = HOME)
CREATE TABLE IF NOT EXISTS "HOME_POLICIES" (
  policy_id      TEXT        PRIMARY KEY,
  policy_number  TEXT        NOT NULL,
  product_cd     TEXT        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'IN_FORCE',
  effective_dt   DATE        NOT NULL,
  expiration_dt  DATE        NOT NULL,
  customer_id    TEXT        NOT NULL REFERENCES "CUSTOMERS" (customer_id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS home_policies_customer_id_idx ON "HOME_POLICIES" (customer_id);

-- 3. AUTO_POLICIES (POL-00051–POL-00100, lineCd = PERSONAL_AUTO)
CREATE TABLE IF NOT EXISTS "AUTO_POLICIES" (
  policy_id      TEXT        PRIMARY KEY,
  policy_number  TEXT        NOT NULL,
  product_cd     TEXT        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'IN_FORCE',
  effective_dt   DATE        NOT NULL,
  expiration_dt  DATE        NOT NULL,
  customer_id    TEXT        NOT NULL REFERENCES "CUSTOMERS" (customer_id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auto_policies_customer_id_idx ON "AUTO_POLICIES" (customer_id);

-- 4. LIFE_POLICIES (LIFE-00001–LIFE-00100, one per customer)
CREATE TABLE IF NOT EXISTS "LIFE_POLICIES" (
  policy_id                TEXT           PRIMARY KEY,
  policy_number            TEXT           NOT NULL,
  customer_id              TEXT           NOT NULL REFERENCES "CUSTOMERS" (customer_id),
  status                   TEXT           NOT NULL DEFAULT 'IN_FORCE'
                             CHECK (status IN ('IN_FORCE', 'LAPSED', 'PAID_UP')),
  policy_type              TEXT           NOT NULL
                             CHECK (policy_type IN ('TERM_10', 'TERM_20', 'TERM_30', 'WHOLE_LIFE', 'UNIVERSAL_LIFE')),
  face_amount              NUMERIC(12, 2) NOT NULL,
  annual_premium           NUMERIC(10, 2) NOT NULL,
  effective_dt             DATE           NOT NULL,
  maturity_dt              DATE,
  beneficiary_name         TEXT           NOT NULL,
  beneficiary_relationship TEXT           NOT NULL,
  insured_age_at_issue     INTEGER        NOT NULL,
  underwriting_class       TEXT           NOT NULL
                             CHECK (underwriting_class IN ('PREFERRED_PLUS', 'PREFERRED', 'STANDARD_PLUS', 'STANDARD')),
  rider_waiver_of_premium  BOOLEAN        NOT NULL DEFAULT FALSE,
  rider_accidental_death   BOOLEAN        NOT NULL DEFAULT FALSE,
  cash_value               NUMERIC(12, 2),
  created_at               TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS life_policies_customer_id_idx ON "LIFE_POLICIES" (customer_id);
CREATE INDEX IF NOT EXISTS life_policies_status_idx      ON "LIFE_POLICIES" (status);

-- 5. EXTERNAL_SUBMISSIONS (standalone — no FK to any other table)
CREATE TABLE IF NOT EXISTS "EXTERNAL_SUBMISSIONS" (
  submission_id                TEXT        PRIMARY KEY,
  submitted_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Submitter (beneficiary)
  relationship_to_deceased     TEXT        NOT NULL
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

CREATE INDEX IF NOT EXISTS external_submissions_submitted_at_idx ON "EXTERNAL_SUBMISSIONS" (submitted_at DESC);

-- =============================================================
-- Optional: enforce referential integrity between policy_risks
-- and HOME_POLICIES. Uncomment after seeding HOME_POLICIES.
-- =============================================================
-- ALTER TABLE policy_risks
--   ADD CONSTRAINT policy_risks_home_policy_fk
--   FOREIGN KEY (policy_system_id) REFERENCES "HOME_POLICIES" (policy_id);
