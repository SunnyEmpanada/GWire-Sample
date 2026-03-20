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
}
