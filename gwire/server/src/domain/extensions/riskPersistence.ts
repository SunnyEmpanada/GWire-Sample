// ==============================================================
// GWire Extensions — NOT part of InsuranceNow emulation
// Durable persistence for custom policy risk rankings.
// ==============================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { MockStore, Policy, RiskCategory, RiskRank } from "../types.js";
import { RISK_CATEGORIES, setRiskRank } from "./riskRanking.js";

const TABLE_NAME = "policy_risks";

type PolicyRiskRow = {
  policy_system_id: string;
  category: RiskCategory;
  risk_level: RiskRank | null;
};

type PolicyRiskUpsertRow = PolicyRiskRow & {
  updated_at?: string;
};

export type RiskPersistenceMode = "memory" | "supabase";

export interface RiskPersistence {
  readonly mode: RiskPersistenceMode;
  initialize(store: MockStore): Promise<void>;
  upsertRank(policySystemId: string, category: RiskCategory, rank: RiskRank): Promise<void>;
  upsertRanks(rows: Array<{ policySystemId: string; category: RiskCategory; rank: RiskRank }>): Promise<void>;
  clearAll(): Promise<void>;
  clearCategory(category: RiskCategory): Promise<void>;
}

export class MemoryRiskPersistence implements RiskPersistence {
  readonly mode = "memory";

  async initialize(_store: MockStore): Promise<void> {
    // The existing MockStore map is already the source of truth in memory mode.
  }

  async upsertRank(_policySystemId: string, _category: RiskCategory, _rank: RiskRank): Promise<void> {}

  async upsertRanks(_rows: Array<{ policySystemId: string; category: RiskCategory; rank: RiskRank }>): Promise<void> {}

  async clearAll(): Promise<void> {}

  async clearCategory(_category: RiskCategory): Promise<void> {}
}

export class SupabaseRiskPersistence implements RiskPersistence {
  readonly mode = "supabase";

  constructor(private readonly client: SupabaseClient) {}

  async initialize(store: MockStore): Promise<void> {
    await this.seedUnassignedRows(store.policies);
    await this.hydrateRiskCache(store);
  }

  async upsertRank(policySystemId: string, category: RiskCategory, rank: RiskRank): Promise<void> {
    await this.upsertRows([
      {
        policy_system_id: policySystemId,
        category,
        risk_level: rank,
        updated_at: new Date().toISOString(),
      },
    ]);
  }

  async upsertRanks(rows: Array<{ policySystemId: string; category: RiskCategory; rank: RiskRank }>): Promise<void> {
    if (rows.length === 0) return;
    const updatedAt = new Date().toISOString();
    await this.upsertRows(
      rows.map((row) => ({
        policy_system_id: row.policySystemId,
        category: row.category,
        risk_level: row.rank,
        updated_at: updatedAt,
      }))
    );
  }

  async clearAll(): Promise<void> {
    const { error } = await this.client
      .from(TABLE_NAME)
      .update({ risk_level: null, updated_at: new Date().toISOString() })
      .not("risk_level", "is", null);
    if (error) throw error;
  }

  async clearCategory(category: RiskCategory): Promise<void> {
    const { error } = await this.client
      .from(TABLE_NAME)
      .update({ risk_level: null, updated_at: new Date().toISOString() })
      .eq("category", category)
      .not("risk_level", "is", null);
    if (error) throw error;
  }

  private async seedUnassignedRows(policies: Policy[]): Promise<void> {
    const rows: PolicyRiskUpsertRow[] = policies.flatMap((policy) =>
      RISK_CATEGORIES.map((category) => ({
        policy_system_id: policy.systemId,
        category,
        risk_level: null,
      }))
    );
    if (rows.length === 0) return;

    const { error } = await this.client
      .from(TABLE_NAME)
      .upsert(rows, { onConflict: "policy_system_id,category", ignoreDuplicates: true });
    if (error) throw error;
  }

  private async hydrateRiskCache(store: MockStore): Promise<void> {
    const { data, error } = await this.client
      .from(TABLE_NAME)
      .select("policy_system_id, category, risk_level")
      .not("risk_level", "is", null);
    if (error) throw error;

    store.riskRanks.clear();
    for (const row of (data ?? []) as PolicyRiskRow[]) {
      if (!store.policyById.has(row.policy_system_id)) continue;
      if (!RISK_CATEGORIES.includes(row.category)) continue;
      if (row.risk_level !== "LOW" && row.risk_level !== "MEDIUM" && row.risk_level !== "HIGH") continue;
      setRiskRank(store, row.policy_system_id, row.category, row.risk_level);
    }
  }

  private async upsertRows(rows: PolicyRiskUpsertRow[]): Promise<void> {
    const { error } = await this.client
      .from(TABLE_NAME)
      .upsert(rows, { onConflict: "policy_system_id,category" });
    if (error) throw error;
  }
}

export function createRiskPersistenceFromEnv(env: NodeJS.ProcessEnv = process.env): RiskPersistence {
  if (env.RISK_PERSISTENCE === "memory") {
    return new MemoryRiskPersistence();
  }

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;

  if (env.RISK_PERSISTENCE === "supabase" || (supabaseUrl && supabaseKey)) {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase risk persistence requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY.");
    }
    return new SupabaseRiskPersistence(
      createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    );
  }

  return new MemoryRiskPersistence();
}

