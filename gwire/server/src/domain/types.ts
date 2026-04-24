export interface Address {
  addressLine1: string;
  city: string;
  stateProvCd: string;
  postalCode: string;
  countryCd: string;
}

export interface Customer {
  systemId: string;
  displayName: string;
  primaryEmail: string;
  primaryPhone: string;
  address: Address;
  accountNumber: string;
}

export interface Policy {
  systemId: string;
  policyNumber: string;
  productCd: string;
  lineCd: "HOME" | "PERSONAL_AUTO";
  status: string;
  effectiveDt: string;
  expirationDt: string;
  customerSystemId: string;
}

export interface Claim {
  systemId: string;
  claimNumber: string;
  status: "OPEN" | "CLOSED" | "PENDING" | "DENIED";
  lossDt: string;
  lossType: string;
  lossDescription: string;
  paidAmount: number;
  reserveAmount: number;
  policySystemId: string;
  customerSystemId: string;
}

/**
 * GWire extension — NOT part of InsuranceNow.
 * Three-level risk ranking reported by an external ranker.
 */
export type RiskRank = "LOW" | "MEDIUM" | "HIGH";

/**
 * GWire extension — NOT part of InsuranceNow.
 * Risk categories the app scaffolds. Only THEFT is rendered in the portal today;
 * FIRE / FLOOD / EARTHQUAKE are carried end-to-end on the server for future use.
 */
export type RiskCategory = "THEFT" | "FIRE" | "FLOOD" | "EARTHQUAKE";

export interface MockStore {
  customers: Customer[];
  policies: Policy[];
  claims: Claim[];
  customerById: Map<string, Customer>;
  policyById: Map<string, Policy>;
  policiesByCustomerId: Map<string, Policy[]>;
  claimsByCustomerId: Map<string, Claim[]>;
  claimsByPolicyId: Map<string, Claim[]>;
  claimById: Map<string, Claim>;
  /** GWire extension — per-policy, per-category risk ranks from an external ranker. */
  riskRanks: Map<string, Partial<Record<RiskCategory, RiskRank>>>;
}
