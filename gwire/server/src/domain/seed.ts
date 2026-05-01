import type { Address, Claim, Customer, MockStore, Policy } from "./types.js";

/** Deterministic PRNG (mulberry32) */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * All 58 California counties with one representative city each (mock mailing addresses).
 * Sorted alphabetically by county name; customers CUST-00001 … CUST-00058 cover one county each.
 */
const CALIFORNIA_COUNTY_SEATS: readonly { readonly county: string; readonly city: string }[] = [
  { county: "Alameda", city: "Oakland" },
  { county: "Alpine", city: "Markleeville" },
  { county: "Amador", city: "Jackson" },
  { county: "Butte", city: "Chico" },
  { county: "Calaveras", city: "San Andreas" },
  { county: "Colusa", city: "Colusa" },
  { county: "Contra Costa", city: "Concord" },
  { county: "Del Norte", city: "Crescent City" },
  { county: "El Dorado", city: "Placerville" },
  { county: "Fresno", city: "Fresno" },
  { county: "Glenn", city: "Willows" },
  { county: "Humboldt", city: "Eureka" },
  { county: "Imperial", city: "El Centro" },
  { county: "Inyo", city: "Independence" },
  { county: "Kern", city: "Bakersfield" },
  { county: "Kings", city: "Hanford" },
  { county: "Lake", city: "Lakeport" },
  { county: "Lassen", city: "Susanville" },
  { county: "Los Angeles", city: "Los Angeles" },
  { county: "Madera", city: "Madera" },
  { county: "Marin", city: "San Rafael" },
  { county: "Mariposa", city: "Mariposa" },
  { county: "Mendocino", city: "Ukiah" },
  { county: "Merced", city: "Merced" },
  { county: "Modoc", city: "Alturas" },
  { county: "Mono", city: "Bridgeport" },
  { county: "Monterey", city: "Salinas" },
  { county: "Napa", city: "Napa" },
  { county: "Nevada", city: "Nevada City" },
  { county: "Orange", city: "Anaheim" },
  { county: "Placer", city: "Auburn" },
  { county: "Plumas", city: "Quincy" },
  { county: "Riverside", city: "Riverside" },
  { county: "Sacramento", city: "Sacramento" },
  { county: "San Benito", city: "Hollister" },
  { county: "San Bernardino", city: "San Bernardino" },
  { county: "San Diego", city: "San Diego" },
  { county: "San Francisco", city: "San Francisco" },
  { county: "San Joaquin", city: "Stockton" },
  { county: "San Luis Obispo", city: "San Luis Obispo" },
  { county: "San Mateo", city: "Redwood City" },
  { county: "Santa Barbara", city: "Santa Barbara" },
  { county: "Santa Clara", city: "San Jose" },
  { county: "Santa Cruz", city: "Santa Cruz" },
  { county: "Shasta", city: "Redding" },
  { county: "Sierra", city: "Downieville" },
  { county: "Siskiyou", city: "Yreka" },
  { county: "Solano", city: "Fairfield" },
  { county: "Sonoma", city: "Santa Rosa" },
  { county: "Stanislaus", city: "Modesto" },
  { county: "Sutter", city: "Yuba City" },
  { county: "Tehama", city: "Red Bluff" },
  { county: "Trinity", city: "Weaverville" },
  { county: "Tulare", city: "Visalia" },
  { county: "Tuolumne", city: "Sonora" },
  { county: "Ventura", city: "Ventura" },
  { county: "Yolo", city: "Woodland" },
  { county: "Yuba", city: "Marysville" },
];

const CALIFORNIA_COUNTY_COUNT = CALIFORNIA_COUNTY_SEATS.length;

/** Canonical list of California county names (58), same order as `CALIFORNIA_COUNTY_SEATS`. */
export const CALIFORNIA_COUNTIES: readonly string[] = CALIFORNIA_COUNTY_SEATS.map((r) => r.county);

const STREETS = [
  "Oak St",
  "Maple Ave",
  "Cedar Ln",
  "Bay View Dr",
  "Sunset Blvd",
  "Mission St",
  "El Camino Real",
];

const FIRST = [
  "Alex",
  "Jordan",
  "Taylor",
  "Casey",
  "Riley",
  "Morgan",
  "Quinn",
  "Avery",
  "Jamie",
  "Cameron",
];

const LAST = [
  "Nguyen",
  "Garcia",
  "Patel",
  "Chen",
  "Martinez",
  "Kim",
  "Thompson",
  "Singh",
  "Brown",
  "Lee",
];

const LOSS_TYPES_HOME = ["FIRE", "WATER", "THEFT", "WIND", "HAIL"];
const LOSS_TYPES_AUTO = ["COLLISION", "COMPREHENSIVE", "GLASS", "TOWING"];

const STATUSES: Claim["status"][] = ["OPEN", "CLOSED", "PENDING", "DENIED"];

export function buildMockStore(seed = 42): MockStore {
  const rnd = mulberry32(seed);
  const customers: Customer[] = [];
  const policies: Policy[] = [];
  const claims: Claim[] = [];

  for (let i = 1; i <= 100; i++) {
    const systemId = `CUST-${String(i).padStart(5, "0")}`;
    const fn = FIRST[Math.floor(rnd() * FIRST.length)]!;
    const ln = LAST[Math.floor(rnd() * LAST.length)]!;
    // Always consume one PRNG draw for "city/county pick" so downstream fields (claims, etc.)
    // match the historical mulberry32 stream for this seed.
    const { county, city } =
      i <= CALIFORNIA_COUNTY_COUNT
        ? (rnd(), CALIFORNIA_COUNTY_SEATS[i - 1]!)
        : CALIFORNIA_COUNTY_SEATS[Math.floor(rnd() * CALIFORNIA_COUNTY_COUNT)]!;
    const street = STREETS[Math.floor(rnd() * STREETS.length)]!;
    const num = 100 + Math.floor(rnd() * 9000);
    const zip = String(90000 + i);

    const address: Address = {
      addressLine1: `${num} ${street}`,
      city,
      county,
      stateProvCd: "CA",
      postalCode: zip,
      countryCd: "US",
    };

    const customer: Customer = {
      systemId,
      displayName: `${fn} ${ln}`,
      primaryEmail: `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@example.com`,
      primaryPhone: `415${String(2000000 + i).slice(0, 7)}`,
      address,
      accountNumber: `ACC-${String(i).padStart(6, "0")}`,
    };
    customers.push(customer);

    const lineCd: Policy["lineCd"] = i <= 50 ? "HOME" : "PERSONAL_AUTO";
    const policySystemId = `POL-${String(i).padStart(5, "0")}`;
    const pol: Policy = {
      systemId: policySystemId,
      policyNumber: `PN-CA-${2024}${String(i).padStart(4, "0")}`,
      productCd: lineCd === "HOME" ? "HO3-CA" : "PAP-CA",
      lineCd,
      status: "IN_FORCE",
      effectiveDt: "2025-06-01",
      expirationDt: "2027-06-01",
      customerSystemId: systemId,
    };
    policies.push(pol);

    const claimCount = Math.floor(rnd() * 3);
    for (let c = 0; c < claimCount; c++) {
      const claimIdx = claims.length + 1;
      const lossTypes = lineCd === "HOME" ? LOSS_TYPES_HOME : LOSS_TYPES_AUTO;
      const status = STATUSES[Math.floor(rnd() * STATUSES.length)]!;
      const claim: Claim = {
        systemId: `CLM-${String(claimIdx).padStart(6, "0")}`,
        claimNumber: `CL-CA-${2024}${String(claimIdx).padStart(5, "0")}`,
        status,
        lossDt: `2024-${String(3 + Math.floor(rnd() * 9)).padStart(2, "0")}-${String(1 + Math.floor(rnd() * 27)).padStart(2, "0")}`,
        lossType: lossTypes[Math.floor(rnd() * lossTypes.length)]!,
        lossDescription:
          lineCd === "HOME"
            ? "Dwelling / property loss reported"
            : "Vehicle damage reported",
        paidAmount: Math.round(rnd() * 15000 * 100) / 100,
        reserveAmount: Math.round(rnd() * 5000 * 100) / 100,
        policySystemId,
        customerSystemId: systemId,
      };
      claims.push(claim);
    }
  }

  const customerById = new Map(customers.map((c) => [c.systemId, c]));
  const policyById = new Map(policies.map((p) => [p.systemId, p]));
  const policiesByCustomerId = new Map<string, Policy[]>();
  for (const p of policies) {
    const list = policiesByCustomerId.get(p.customerSystemId) ?? [];
    list.push(p);
    policiesByCustomerId.set(p.customerSystemId, list);
  }
  const claimsByCustomerId = new Map<string, Claim[]>();
  const claimsByPolicyId = new Map<string, Claim[]>();
  const claimById = new Map<string, Claim>();
  for (const cl of claims) {
    claimById.set(cl.systemId, cl);
    const byC = claimsByCustomerId.get(cl.customerSystemId) ?? [];
    byC.push(cl);
    claimsByCustomerId.set(cl.customerSystemId, byC);
    const byP = claimsByPolicyId.get(cl.policySystemId) ?? [];
    byP.push(cl);
    claimsByPolicyId.set(cl.policySystemId, byP);
  }

  return {
    customers,
    policies,
    claims,
    customerById,
    policyById,
    policiesByCustomerId,
    claimsByCustomerId,
    claimsByPolicyId,
    claimById,
    riskRanks: new Map(),
  };
}
