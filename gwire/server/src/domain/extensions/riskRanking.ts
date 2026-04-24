// ==============================================================
// GWire Extensions — NOT part of InsuranceNow emulation
// The code in this folder implements custom GWire-only features
// that are not part of the Guidewire InsuranceNow 2025.3 API.
// ==============================================================

import type { MockStore, Policy, RiskCategory, RiskRank } from "../types.js";

const RANK_BY_NAME: Record<string, RiskRank> = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
};

const RANK_BY_NUMBER: Record<string, RiskRank> = {
  "1": "LOW",
  "2": "MEDIUM",
  "3": "HIGH",
};

const CATEGORY_BY_NAME: Record<string, RiskCategory> = {
  THEFT: "THEFT",
  FIRE: "FIRE",
  FLOOD: "FLOOD",
  EARTHQUAKE: "EARTHQUAKE",
  // Alias: the existing claim loss-type vocabulary calls flooding "WATER".
  WATER: "FLOOD",
};

export const RISK_CATEGORIES: readonly RiskCategory[] = [
  "THEFT",
  "FIRE",
  "FLOOD",
  "EARTHQUAKE",
];

/** Accepts "LOW"|"MEDIUM"|"HIGH" (any case) or 1|2|3 (number or numeric string). */
export function normalizeRank(input: unknown): RiskRank | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    return RANK_BY_NUMBER[String(input)] ?? null;
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed === "") return null;
    return (
      RANK_BY_NAME[trimmed.toUpperCase()] ??
      RANK_BY_NUMBER[trimmed] ??
      null
    );
  }
  return null;
}

/** Accepts "THEFT"|"FIRE"|"FLOOD"|"EARTHQUAKE" (any case). "WATER" aliases to "FLOOD". */
export function normalizeCategory(input: unknown): RiskCategory | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed === "") return null;
  return CATEGORY_BY_NAME[trimmed.toUpperCase()] ?? null;
}

/** Upsert a single rank into the store. */
export function setRiskRank(
  store: MockStore,
  policySystemId: string,
  category: RiskCategory,
  rank: RiskRank
): void {
  const entry = store.riskRanks.get(policySystemId) ?? {};
  entry[category] = rank;
  store.riskRanks.set(policySystemId, entry);
}

/** Delete one category across every policy; returns how many policies were affected. */
export function clearCategory(store: MockStore, category: RiskCategory): number {
  let cleared = 0;
  for (const [policyId, entry] of store.riskRanks) {
    if (entry[category] !== undefined) {
      delete entry[category];
      cleared += 1;
      if (Object.keys(entry).length === 0) {
        store.riskRanks.delete(policyId);
      }
    }
  }
  return cleared;
}

/** Shape returned on policy responses. All four keys are always present. */
export type PolicyRiskRanks = {
  theft: RiskRank | null;
  fire: RiskRank | null;
  flood: RiskRank | null;
  earthquake: RiskRank | null;
};

/** Snapshot the per-category ranks for a policy as a flat object with null defaults. */
export function policyRiskRanks(store: MockStore, policySystemId: string): PolicyRiskRanks {
  const entry = store.riskRanks.get(policySystemId) ?? {};
  return {
    theft: entry.THEFT ?? null,
    fire: entry.FIRE ?? null,
    flood: entry.FLOOD ?? null,
    earthquake: entry.EARTHQUAKE ?? null,
  };
}

/** Attach `riskRanks` to a policy read response. */
export function withRisk<T extends Policy>(
  store: MockStore,
  policy: T
): T & { riskRanks: PolicyRiskRanks } {
  return { ...policy, riskRanks: policyRiskRanks(store, policy.systemId) };
}
