// One-shot Supabase seeder — populates all tables from mock store data.
// Run via: npm run seed-supabase  (from gwire/server/)
// Idempotent: re-running skips rows that already exist (ignoreDuplicates).

import { createClient } from '@supabase/supabase-js';
import { buildMockStore } from '../src/domain/seed.js';

// ── Supabase client ───────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) must be set.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function upsertTable(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<void> {
  console.log(`  → ${table}: upserting ${rows.length} rows...`);
  const { error } = await supabase
    .from(table)
    .upsert(rows, { onConflict, ignoreDuplicates: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`    ✓ done`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(n: number, len: number): string {
  return String(n).padStart(len, '0');
}

// ── Customer demographic helpers (index-based, deterministic) ─────────────────

function ssnForIndex(i: number): string {
  // Avoids reserved SSN ranges: area 000/666/900–999, group 00, serial 0000.
  const area = 100 + ((i * 37) % 564);  // 100–663 (all valid)
  const group = 1 + ((i * 7) % 99);     // 01–99
  const serial = 1000 + ((i * 331) % 9000); // 1000–9999
  return `${pad(area, 3)}-${pad(group, 2)}-${pad(serial, 4)}`;
}

function dobForIndex(i: number): string {
  // Places customers aged 25–65 at 2026 → birth years 1961–2001.
  const year = 1961 + ((i * 13) % 41);
  const month = ((i * 7) % 12) + 1;
  const day = ((i * 11) % 28) + 1;
  return `${year}-${pad(month, 2)}-${pad(day, 2)}`;
}

function dobYearForIndex(i: number): number {
  return 1961 + ((i * 13) % 41);
}

// ── Life policy helpers ───────────────────────────────────────────────────────

const POLICY_TYPES = [
  'TERM_20', 'WHOLE_LIFE', 'TERM_30', 'UNIVERSAL_LIFE', 'TERM_10',
] as const;
type PolicyType = (typeof POLICY_TYPES)[number];

const FACE_AMOUNTS = [100_000, 250_000, 500_000, 750_000, 1_000_000, 1_500_000, 2_000_000] as const;

const BASE_RATES: Record<PolicyType, number> = {
  TERM_10: 0.0025,
  TERM_20: 0.0045,
  TERM_30: 0.0070,
  WHOLE_LIFE: 0.020,
  UNIVERSAL_LIFE: 0.015,
};

const UNDERWRITING_CLASSES = [
  'PREFERRED_PLUS', 'PREFERRED', 'STANDARD_PLUS', 'STANDARD',
] as const;

const BENEFICIARY_RELS = ['SPOUSE', 'CHILD', 'PARENT', 'SIBLING', 'ESTATE'] as const;
const BENE_FIRST = [
  'Sarah', 'Michael', 'Jennifer', 'David', 'Lisa',
  'Robert', 'Michelle', 'James', 'Patricia', 'William',
];

const LIFE_STATUSES = [
  'IN_FORCE', 'IN_FORCE', 'IN_FORCE', 'IN_FORCE', 'IN_FORCE',
  'IN_FORCE', 'IN_FORCE', 'IN_FORCE', 'LAPSED', 'PAID_UP',
] as const;

function lifeEffectiveDt(i: number): string {
  // Spreads from 2020-01 to 2024-04 across 100 customers.
  const year = 2020 + Math.floor((i - 1) / 20);
  const month = ((i - 1) % 12) + 1;
  return `${year}-${pad(month, 2)}-01`;
}

function lifeMaturityDt(policyType: PolicyType, effectiveDt: string, dobYear: number): string {
  const effYear = parseInt(effectiveDt.slice(0, 4), 10);
  const effMonth = effectiveDt.slice(5, 7);
  switch (policyType) {
    case 'TERM_10': return `${effYear + 10}-${effMonth}-01`;
    case 'TERM_20': return `${effYear + 20}-${effMonth}-01`;
    case 'TERM_30': return `${effYear + 30}-${effMonth}-01`;
    case 'WHOLE_LIFE':
    case 'UNIVERSAL_LIFE':
      return `${dobYear + 100}-01-01`;
  }
}

// ── External submission helpers ───────────────────────────────────────────────

const RELATIONSHIPS = [
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
  'Trustee',
] as const;

const SUB_FIRST = [
  'Maria', 'John', 'Susan', 'Robert', 'Patricia',
  'Michael', 'Linda', 'David', 'Barbara', 'James',
  'Elizabeth', 'William', 'Jennifer', 'Richard', 'Mary',
  'Thomas', 'Jessica', 'Charles', 'Sarah', 'Christopher',
  'Karen', 'Daniel', 'Nancy', 'Matthew', 'Lisa',
];

const SUB_LAST = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones',
  'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
];

const SUB_STREETS = [
  '123 Main St', '456 Oak Ave', '789 Pine Rd', '321 Elm St', '654 Cedar Ave',
  '987 Maple Dr', '147 Birch Ln', '258 Walnut St', '369 Cherry Blvd', '741 Spruce Way',
  '852 Willow Ct', '963 Ash Pl', '159 Poplar Dr', '357 Hickory Rd', '486 Sycamore Blvd',
  '612 Juniper St', '738 Magnolia Ave', '864 Cypress Ln', '975 Redwood Dr', '213 Sequoia Way',
];

const SUB_CITIES = [
  'Phoenix', 'Dallas', 'Chicago', 'Houston', 'Philadelphia',
  'San Antonio', 'San Diego', 'Jacksonville', 'Austin', 'Columbus',
  'Charlotte', 'Indianapolis', 'Seattle', 'Denver', 'Nashville',
  'Oklahoma City', 'Las Vegas', 'Boston', 'Portland', 'Baltimore',
];

const ADDRESS_2_OPTIONS = [
  'Apt 101', 'Suite 200', 'Unit 5', 'Apt 2B', '#300', 'Floor 4', 'Apt 7', 'Suite A',
];

const STATE_OPTIONS = [
  'CA', 'TX', 'FL', 'NY', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI', 'NJ', 'VA', 'WA', 'AZ', 'TN',
];

const COMMENTS_OPTIONS = [
  'Please process this claim promptly. All documentation has been submitted.',
  'I am the primary beneficiary listed on the policy and am filing on behalf of the estate.',
  'Please contact me if additional documentation is required.',
  'This is time-sensitive — we need funds to cover funeral expenses.',
  'I am filing as executor of the estate. A certified copy of the death certificate is enclosed.',
  'Please confirm receipt of this submission at the email provided.',
  'My attorney will be in contact regarding the estate proceedings.',
];

function submissionDate(i: number): string {
  // Spreads across 2023–2025.
  const year = 2023 + Math.floor(i / 9);
  const month = ((i * 3) % 12) + 1;
  const day = ((i * 7) % 28) + 1;
  return `${year}-${pad(month, 2)}-${pad(day, 2)}T${pad(10 + (i % 8), 2)}:${pad((i * 7) % 60, 2)}:00Z`;
}

function dateOfDeath(i: number): string {
  const year = 2022 + Math.floor(i / 9);
  const month = ((i * 5) % 12) + 1;
  const day = ((i * 11) % 28) + 1;
  return `${year}-${pad(month, 2)}-${pad(day, 2)}`;
}

function policyholderDob(i: number): string {
  const year = 1940 + ((i * 17) % 45); // 1940–1984
  const month = ((i * 7) % 12) + 1;
  const day = ((i * 13) % 28) + 1;
  return `${year}-${pad(month, 2)}-${pad(day, 2)}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Loading mock store...');
  const store = buildMockStore();
  console.log(`  ${store.customers.length} customers, ${store.policies.length} policies\n`);

  // 1. customers
  const customerRows = store.customers.map((c, idx) => {
    const i = idx + 1;
    return {
      customer_id: c.systemId,
      display_name: c.displayName,
      primary_email: c.primaryEmail,
      primary_phone: c.primaryPhone,
      account_number: c.accountNumber,
      ssn: ssnForIndex(i),
      date_of_birth: dobForIndex(i),
      gender: i % 2 === 0 ? 'M' : 'F',
      tobacco_use: i % 7 === 0,
      address_line1: c.address.addressLine1,
      city: c.address.city,
      county: c.address.county,
      state_prov_cd: c.address.stateProvCd,
      postal_code: c.address.postalCode,
      country_cd: c.address.countryCd,
    };
  });
  await upsertTable('CUSTOMERS', customerRows, 'customer_id');

  // 2. home_policies
  const homeRows = store.policies
    .filter((p) => p.lineCd === 'HOME')
    .map((p) => ({
      policy_id: p.systemId,
      policy_number: p.policyNumber,
      product_cd: p.productCd,
      status: p.status,
      effective_dt: p.effectiveDt,
      expiration_dt: p.expirationDt,
      customer_id: p.customerSystemId,
    }));
  await upsertTable('HOME_POLICIES', homeRows, 'policy_id');

  // 3. auto_policies
  const autoRows = store.policies
    .filter((p) => p.lineCd === 'PERSONAL_AUTO')
    .map((p) => ({
      policy_id: p.systemId,
      policy_number: p.policyNumber,
      product_cd: p.productCd,
      status: p.status,
      effective_dt: p.effectiveDt,
      expiration_dt: p.expirationDt,
      customer_id: p.customerSystemId,
    }));
  await upsertTable('AUTO_POLICIES', autoRows, 'policy_id');

  // 4. life_policies (one per customer, generated)
  const lifeRows = store.customers.map((c, idx) => {
    const i = idx + 1;
    const policyType = POLICY_TYPES[i % 5]!;
    const faceAmount = FACE_AMOUNTS[i % 7]!;
    const ageAtIssue = 25 + ((i * 13) % 41);
    const tobaccoUse = i % 7 === 0;
    const annualPremium =
      Math.round(
        faceAmount * BASE_RATES[policyType] * (ageAtIssue / 35) * (tobaccoUse ? 1.5 : 1.0) * 100,
      ) / 100;
    const effectiveDt = lifeEffectiveDt(i);
    const dobYear = dobYearForIndex(i);
    const isTermPolicy = policyType.startsWith('TERM');
    const customerLastName = c.displayName.split(' ')[1] ?? 'Unknown';

    return {
      policy_id: `LIFE-${pad(i, 5)}`,
      policy_number: `PN-LIFE-CA-${pad(i, 5)}`,
      customer_id: c.systemId,
      status: LIFE_STATUSES[i % 10]!,
      policy_type: policyType,
      face_amount: faceAmount,
      annual_premium: annualPremium,
      effective_dt: effectiveDt,
      maturity_dt: lifeMaturityDt(policyType, effectiveDt, dobYear),
      beneficiary_name: `${BENE_FIRST[i % 10]} ${customerLastName}`,
      beneficiary_relationship: BENEFICIARY_RELS[i % 5]!,
      insured_age_at_issue: ageAtIssue,
      underwriting_class: UNDERWRITING_CLASSES[i % 4]!,
      rider_waiver_of_premium: i % 3 === 0,
      rider_accidental_death: i % 4 === 0,
      cash_value: isTermPolicy ? null : Math.round(faceAmount * 0.1 * 100) / 100,
    };
  });
  await upsertTable('LIFE_POLICIES', lifeRows, 'policy_id');

  // 5. external_submissions (25 sample rows)
  const SUBMISSION_COUNT = 25;
  const subRows: Record<string, unknown>[] = [];
  for (let i = 1; i <= SUBMISSION_COUNT; i++) {
    const country = i % 13 === 0 ? 'MX' : i % 10 === 0 ? 'CA' : 'US';
    const firstName = SUB_FIRST[(i - 1) % SUB_FIRST.length]!;
    const lastName = SUB_LAST[(i - 1) % SUB_LAST.length]!;

    const row: Record<string, unknown> = {
      submission_id: `SUB-${pad(i, 5)}`,
      submitted_at: submissionDate(i),
      relationship_to_deceased: RELATIONSHIPS[i % RELATIONSHIPS.length]!,
      first_name: firstName,
      last_name: lastName,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
      phone_number: `(${300 + (i % 700)}) 555-${pad((i * 1379) % 10000, 4)}`,
      address_1: SUB_STREETS[(i - 1) % SUB_STREETS.length]!,
      city: SUB_CITIES[(i - 1) % SUB_CITIES.length]!,
      country,
      policyholder_first_name: SUB_FIRST[(i + 12) % SUB_FIRST.length]!,
      policyholder_last_name: SUB_LAST[(i + 5) % SUB_LAST.length]!,
      date_of_death: dateOfDeath(i),
      policyholder_date_of_birth: policyholderDob(i),
      policyholder_ssn_last4: pad(1000 + ((i * 373) % 9000), 4),
    };

    // Optional fields — presence determined by index to hit target sparsity.
    if (i % 5 === 0 || i % 5 === 1)
      row.address_2 = ADDRESS_2_OPTIONS[i % ADDRESS_2_OPTIONS.length];      // ~40%
    if (i % 10 === 1)
      row.address_3 = 'c/o Family Trust';                                   // ~10%
    if (i % 2 === 0)
      row.state_province = STATE_OPTIONS[i % STATE_OPTIONS.length];          // ~50%
    if (i % 5 >= 2)
      row.zip_postal_code = pad(10000 + ((i * 337) % 90000), 5);            // ~60%
    if (i % 3 === 0)
      row.comments = COMMENTS_OPTIONS[i % COMMENTS_OPTIONS.length];          // ~33%
    if (i % 10 === 3)
      row.policy_contract_number = `PN-LIFE-CA-${pad(i * 11, 5)}`;         // ~10%

    subRows.push(row);
  }
  await upsertTable('EXTERNAL_SUBMISSIONS', subRows, 'submission_id');

  console.log('\nSeeding complete.');
}

main().catch((err: unknown) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
