import type { SupabaseClient } from "@supabase/supabase-js";

export function policyholderSubmissionKey(ssnLast4: string, dateOfBirth: string): string {
  return `${ssnLast4.trim()}|${dateOfBirth.trim()}`;
}

export function policyNumberSubmissionKey(policyNumber: string): string {
  return `pn:${policyNumber.trim()}`;
}

export function isPolicyholderSubmitted(
  submitted: Set<string>,
  ssnLast4: string,
  dateOfBirth: string,
  policyNumber?: string | null
): boolean {
  if (submitted.has(policyholderSubmissionKey(ssnLast4, dateOfBirth))) return true;
  if (policyNumber?.trim() && submitted.has(policyNumberSubmissionKey(policyNumber))) {
    return true;
  }
  return false;
}

export function shuffledIds<T>(ids: readonly T[]): T[] {
  const copy = [...ids];
  for (let j = copy.length - 1; j > 0; j--) {
    const k = Math.floor(Math.random() * (j + 1));
    [copy[j], copy[k]] = [copy[k]!, copy[j]!];
  }
  return copy;
}

/** 1-based seed index from a CUST-00042 style system id. */
export function customerSeedIndex(systemId: string): number | null {
  const match = /^CUST-(\d+)$/.exec(systemId.trim());
  if (!match) return null;
  const index = parseInt(match[1]!, 10);
  return Number.isFinite(index) && index > 0 ? index : null;
}

/** In-memory customers that also have a life policy row in the primary database. */
export function demoFillCandidateIds(
  inMemoryCustomerIds: readonly string[],
  primaryLifeCustomerIds: ReadonlySet<string>
): string[] {
  const eligible = inMemoryCustomerIds.filter((id) => primaryLifeCustomerIds.has(id));
  return shuffledIds(eligible);
}

export type PrimaryDemoFillRecord = {
  customerId: string;
  displayName: string;
  ssn: string;
  dateOfBirth: string;
  primaryPhone: string;
  addressLine1: string;
  city: string;
  stateProvCd: string;
  countryCd: string;
  postalCode: string;
  policyNumber: string;
  beneficiaryName: string;
  beneficiaryRelationship: string;
};

type CustomerRow = {
  customer_id: string;
  display_name: string;
  ssn: string;
  date_of_birth: string;
  primary_phone: string;
  address_line1: string;
  city: string;
  state_prov_cd: string;
  country_cd: string;
  postal_code: string;
};

type LifePolicyRow = {
  customer_id: string;
  policy_number: string;
  beneficiary_name: string;
  beneficiary_relationship: string;
};

/** Customer ids with a LIFE_POLICIES row in the primary database. */
export async function loadPrimaryLifeCustomerIds(
  primary: SupabaseClient
): Promise<Set<string>> {
  const { data, error } = await primary.from("LIFE_POLICIES").select("customer_id");
  if (error) {
    throw new Error(error.message);
  }
  return new Set((data ?? []).map((row) => (row as LifePolicyRow).customer_id));
}

/** Batch-load demo fill fields for the given customer ids from the primary database. */
export async function loadPrimaryDemoFillRecords(
  primary: SupabaseClient,
  customerIds: readonly string[]
): Promise<Map<string, PrimaryDemoFillRecord>> {
  if (customerIds.length === 0) return new Map();

  const [{ data: customers, error: custErr }, { data: policies, error: polErr }] =
    await Promise.all([
      primary
        .from("CUSTOMERS")
        .select(
          "customer_id,display_name,ssn,date_of_birth,primary_phone,address_line1,city,state_prov_cd,country_cd,postal_code"
        )
        .in("customer_id", [...customerIds]),
      primary
        .from("LIFE_POLICIES")
        .select("customer_id,policy_number,beneficiary_name,beneficiary_relationship")
        .in("customer_id", [...customerIds]),
    ]);

  if (custErr) throw new Error(custErr.message);
  if (polErr) throw new Error(polErr.message);

  const policyByCustomer = new Map(
    ((policies ?? []) as LifePolicyRow[]).map((row) => [row.customer_id, row])
  );

  const records = new Map<string, PrimaryDemoFillRecord>();
  for (const row of (customers ?? []) as CustomerRow[]) {
    const policy = policyByCustomer.get(row.customer_id);
    if (!policy) continue;
    records.set(row.customer_id, {
      customerId: row.customer_id,
      displayName: row.display_name,
      ssn: row.ssn,
      dateOfBirth: row.date_of_birth,
      primaryPhone: row.primary_phone,
      addressLine1: row.address_line1,
      city: row.city,
      stateProvCd: row.state_prov_cd,
      countryCd: row.country_cd,
      postalCode: row.postal_code,
      policyNumber: policy.policy_number,
      beneficiaryName: policy.beneficiary_name,
      beneficiaryRelationship: policy.beneficiary_relationship,
    });
  }

  return records;
}

type SubmissionRow = {
  policyholder_ssn_last4: string | null;
  policyholder_date_of_birth: string | null;
  policy_contract_number: string | null;
};

/** Policyholders already present in the secondary EXTERNAL_SUBMISSIONS table. */
export async function loadSubmittedPolicyholderKeys(
  extClient: SupabaseClient
): Promise<Set<string>> {
  const submitted = new Set<string>();
  const { data, error } = await extClient
    .from("EXTERNAL_SUBMISSIONS")
    .select("policyholder_ssn_last4,policyholder_date_of_birth,policy_contract_number");

  if (error) {
    throw new Error(error.message);
  }

  for (const row of (data ?? []) as SubmissionRow[]) {
    if (row.policyholder_ssn_last4 && row.policyholder_date_of_birth) {
      submitted.add(
        policyholderSubmissionKey(row.policyholder_ssn_last4, row.policyholder_date_of_birth)
      );
    }
    if (row.policy_contract_number?.trim()) {
      submitted.add(policyNumberSubmissionKey(row.policy_contract_number));
    }
  }

  return submitted;
}

export function buildDemoFillResponse(
  record: PrimaryDemoFillRecord,
  relMap: Record<string, string>
): Record<string, string> {
  const [dobYear, dobMonthRaw, dobDayRaw] = record.dateOfBirth.split("-");
  const ssnLast4 = record.ssn.slice(-4);
  const [polFirst, ...polLastParts] = record.displayName.split(" ");
  const polLast = polLastParts.join(" ");
  const [beneFirst, ...beneLastParts] = record.beneficiaryName.split(" ");
  const beneLast = beneLastParts.join(" ") || polLast;

  return {
    polFirstName: polFirst ?? "",
    polLastName: polLast,
    deathMonth: "6",
    deathDay: "15",
    deathYear: "2024",
    dobMonth: String(parseInt(dobMonthRaw ?? "1", 10)),
    dobDay: String(parseInt(dobDayRaw ?? "1", 10)),
    dobYear: dobYear ?? "",
    ssnLast4,
    policyNumber: record.policyNumber,
    relationship: relMap[record.beneficiaryRelationship] ?? "Family Member",
    firstName: beneFirst ?? "",
    lastName: beneLast,
    email: `${(beneFirst ?? "").toLowerCase()}.${beneLast.toLowerCase()}@example.com`,
    phone: record.primaryPhone,
    address1: record.addressLine1,
    city: record.city,
    stateProvince: record.stateProvCd,
    country: record.countryCd,
    zipCode: record.postalCode,
  };
}
