import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { createClient } from "@supabase/supabase-js";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import type { OpenAPI } from "openapi-types";
import { loadSpec, listGetOperations, toFastifyPath } from "./openapi/loadSpec.js";
import { sampleJsonResponse } from "./openapi/sampleResponse.js";
import { buildMockStore } from "./domain/seed.js";
import { handleOverride } from "./domain/overrides.js";
import type { RiskCategory } from "./domain/types.js";
import {
  clearCategory,
  normalizeCategory,
  normalizeRank,
  setRiskRank,
} from "./domain/extensions/riskRanking.js";
import {
  createRiskPersistenceFromEnv,
  type RiskPersistence,
} from "./domain/extensions/riskPersistence.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Monorepo root (works when running from src/ or dist/ with full repo present). */
export const repoRoot = path.resolve(__dirname, "../../..");

/**
 * OpenAPI file must exist at runtime. Vercel/serverless bundles often only ship `dist/`,
 * so `npm run build` copies `../../spec` → `dist/spec` (see scripts/copy-spec.mjs).
 */
export function resolveSpecPath(): string {
  const name = "insurancenow-20253.openapi.yaml";
  const candidates = [
    path.join(__dirname, "spec", name),
    path.join(__dirname, "../../../spec", name),
    path.join(process.cwd(), "spec", name),
    path.join(process.cwd(), "gwire/server/dist/spec", name),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    `GWire: OpenAPI spec not found. Tried:\n${candidates.map((c) => `  - ${c}`).join("\n")}`
  );
}

export function resolveWebDist(): string {
  const candidates = [
    path.join(__dirname, "../../../gwire/web/dist"),
    path.join(repoRoot, "gwire/web/dist"),
    path.join(process.cwd(), "gwire/web/dist"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return path.join(repoRoot, "gwire/web/dist");
}

export const specPath = resolveSpecPath();
export const webDist = resolveWebDist();

export const store = buildMockStore();

function countPoliciesWithAnyRisk(): number {
  return store.riskRanks.size;
}

function countPoliciesWithCategory(category: RiskCategory): number {
  let count = 0;
  for (const entry of store.riskRanks.values()) {
    if (entry[category] !== undefined) count += 1;
  }
  return count;
}

function riskPersistenceMessage(error: unknown): string {
  return error instanceof Error ? error.message : "risk persistence failed";
}

export async function createApp(options: { riskPersistence?: RiskPersistence } = {}) {
  const spec = (await loadSpec(specPath)) as OpenAPI.Document;
  const riskPersistence = options.riskPersistence ?? createRiskPersistenceFromEnv();
  await riskPersistence.initialize(store);

  const app = Fastify({
    logger: process.env.NODE_ENV === "production",
  });
  await app.register(cors, { origin: true });

  const gets = listGetOperations(spec);
  for (const { path: openapiPath, operationId, operation } of gets) {
    const routePath = toFastifyPath(openapiPath);
    app.get(routePath, async (req, reply) => {
      const op = operation as OpenAPI.Operation;
      const overridden = handleOverride(store, operationId, req, op);
      if (overridden === null) {
        return reply.code(404).type("application/json").send({ message: "Not found" });
      }
      if (overridden !== undefined) {
        return reply.type("application/json").send(overridden);
      }
      const body = sampleJsonResponse(op, spec);
      return reply.type("application/json").send(body);
    });
  }

  // ==============================================================
  // GWire Extensions — NOT part of InsuranceNow emulation
  // The endpoints below are custom to this mock app and are not
  // found in the Guidewire InsuranceNow 2025.3 OpenAPI surface.
  // They are documented in spec/insurancenow-20253.openapi.yaml
  // under the "GWire Extensions (non-InsuranceNow)" tag.
  // ==============================================================

  // POST /policies/:systemId/riskRanking — upsert a rank for one policy.
  // Body: { rank: "LOW"|"MEDIUM"|"HIGH" | 1|2|3, category?: "THEFT"|"FIRE"|"FLOOD"|"EARTHQUAKE" }
  // `category` defaults to "THEFT" when omitted; "WATER" aliases to "FLOOD".
  app.post("/policies/:systemId/riskRanking", async (req, reply) => {
    const { systemId } = req.params as { systemId: string };
    const body = (req.body ?? {}) as { rank?: unknown; category?: unknown };
    const rank = normalizeRank(body.rank);
    const category = normalizeCategory(body.category ?? "THEFT");
    if (!rank) {
      return reply
        .code(400)
        .send({ message: "rank must be LOW|MEDIUM|HIGH or 1|2|3" });
    }
    if (!category) {
      return reply
        .code(400)
        .send({ message: "category must be THEFT|FIRE|FLOOD|EARTHQUAKE" });
    }
    if (!store.policyById.has(systemId)) {
      return reply.code(404).send({ message: "policy not found" });
    }
    try {
      await riskPersistence.upsertRank(systemId, category, rank);
    } catch (error) {
      return reply.code(503).send({
        message: "Could not persist risk ranking",
        detail: riskPersistenceMessage(error),
      });
    }
    setRiskRank(store, systemId, category, rank);
    return reply.code(200).send({ policySystemId: systemId, category, rank });
  });

  // POST /riskRankings — bulk upsert. Body: [{ policySystemId, category?, rank }, ...]
  // Returns 200 when all items are accepted, 207 when some were rejected.
  app.post("/riskRankings", async (req, reply) => {
    const items = Array.isArray(req.body) ? (req.body as unknown[]) : [];
    const accepted: Array<{
      policySystemId: string;
      category: RiskCategory;
      rank: NonNullable<ReturnType<typeof normalizeRank>>;
    }> = [];
    const errors: Array<{ policySystemId: string | null; error: string }> = [];
    for (const raw of items) {
      const item = (raw ?? {}) as {
        policySystemId?: unknown;
        category?: unknown;
        rank?: unknown;
      };
      const policySystemId =
        typeof item.policySystemId === "string" ? item.policySystemId : null;
      if (!policySystemId) {
        errors.push({ policySystemId: null, error: "policySystemId is required" });
        continue;
      }
      if (!store.policyById.has(policySystemId)) {
        errors.push({ policySystemId, error: "policy not found" });
        continue;
      }
      const rank = normalizeRank(item.rank);
      if (!rank) {
        errors.push({
          policySystemId,
          error: "rank must be LOW|MEDIUM|HIGH or 1|2|3",
        });
        continue;
      }
      const category = normalizeCategory(item.category ?? "THEFT");
      if (!category) {
        errors.push({
          policySystemId,
          error: "category must be THEFT|FIRE|FLOOD|EARTHQUAKE",
        });
        continue;
      }
      accepted.push({ policySystemId, category, rank });
    }
    try {
      await riskPersistence.upsertRanks(accepted);
    } catch (error) {
      return reply.code(503).send({
        message: "Could not persist risk rankings",
        detail: riskPersistenceMessage(error),
      });
    }
    for (const row of accepted) {
      setRiskRank(store, row.policySystemId, row.category, row.rank);
    }
    return reply
      .code(errors.length ? 207 : 200)
      .send({ accepted, errors });
  });

  // DELETE /riskRankings — wipe all ranks across all policies and categories.
  app.delete("/riskRankings", async (_req, reply) => {
    const cleared = countPoliciesWithAnyRisk();
    try {
      await riskPersistence.clearAll();
    } catch (error) {
      return reply.code(503).send({
        message: "Could not clear risk rankings",
        detail: riskPersistenceMessage(error),
      });
    }
    store.riskRanks.clear();
    return reply.code(200).send({ cleared });
  });

  // POST /submissions — record a death notification in the external Supabase project.
  // Credentials (EXT_SUPABASE_URL / EXT_SUPABASE_SERVICE_ROLE_KEY) are server-side only.
  app.post("/submissions", async (req, reply) => {
    const extUrl = process.env.EXT_SUPABASE_URL;
    const extKey = process.env.EXT_SUPABASE_SERVICE_ROLE_KEY;
    if (!extUrl || !extKey) {
      return reply.code(503).send({ message: "External submissions not configured" });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;

    const required = [
      "policyholder_first_name", "policyholder_last_name",
      "date_of_death", "policyholder_date_of_birth", "policyholder_ssn_last4",
      "relationship_to_deceased", "first_name", "last_name",
      "email", "phone_number", "address_1", "city", "country",
    ];
    for (const field of required) {
      if (!body[field] || typeof body[field] !== "string" || !(body[field] as string).trim()) {
        return reply.code(400).send({ message: `${field} is required` });
      }
    }

    const extClient = createClient(extUrl, extKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { count, error: countError } = await extClient
      .from("EXTERNAL_SUBMISSIONS")
      .select("*", { count: "exact", head: true });

    if (countError) {
      return reply.code(503).send({
        message: "Could not generate submission ID",
        detail: countError.message,
      });
    }

    const submissionId = `SUB-${String((count ?? 0) + 1).padStart(5, "0")}`;

    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

    const row: Record<string, string> = {
      submission_id: submissionId,
      submitted_at: new Date().toISOString(),
      policyholder_first_name: (body.policyholder_first_name as string).trim(),
      policyholder_last_name: (body.policyholder_last_name as string).trim(),
      date_of_death: body.date_of_death as string,
      policyholder_date_of_birth: body.policyholder_date_of_birth as string,
      policyholder_ssn_last4: (body.policyholder_ssn_last4 as string).trim(),
      relationship_to_deceased: body.relationship_to_deceased as string,
      first_name: (body.first_name as string).trim(),
      last_name: (body.last_name as string).trim(),
      email: (body.email as string).trim(),
      phone_number: (body.phone_number as string).trim(),
      address_1: (body.address_1 as string).trim(),
      city: (body.city as string).trim(),
      country: body.country as string,
    };

    const optional: Record<string, string | undefined> = {
      policy_contract_number: str(body.policy_contract_number),
      address_2: str(body.address_2),
      address_3: str(body.address_3),
      state_province: str(body.state_province),
      zip_postal_code: str(body.zip_postal_code),
      comments: str(body.comments),
    };
    for (const [k, v] of Object.entries(optional)) {
      if (v) row[k] = v;
    }

    const { error: insertError } = await extClient.from("EXTERNAL_SUBMISSIONS").insert(row);

    if (insertError) {
      return reply.code(503).send({
        message: "Could not save submission",
        detail: insertError.message,
      });
    }

    return reply.code(201).send({ submission_id: submissionId });
  });

  // DELETE /riskRankings/:category — wipe one category across all policies.
  app.delete("/riskRankings/:category", async (req, reply) => {
    const raw = (req.params as { category?: string }).category;
    const category = normalizeCategory(raw);
    if (!category) {
      return reply
        .code(400)
        .send({ message: "category must be THEFT|FIRE|FLOOD|EARTHQUAKE" });
    }
    const cleared = countPoliciesWithCategory(category);
    try {
      await riskPersistence.clearCategory(category);
    } catch (error) {
      return reply.code(503).send({
        message: "Could not clear risk rankings",
        detail: riskPersistenceMessage(error),
      });
    }
    clearCategory(store, category);
    return reply.code(200).send({ category, cleared });
  });

  if (existsSync(webDist)) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: "/",
      index: ["index.html"],
    });

    // SPA deep links (e.g. `/CUST-00002`): no static file → serve `index.html` for browsers.
    app.setNotFoundHandler((req, reply) => {
      const accept = req.headers.accept ?? "";
      if (req.method === "GET" && accept.includes("text/html")) {
        return reply.type("text/html").sendFile("index.html");
      }
      return reply.code(404).type("application/json").send({ message: "Not found" });
    });
  }

  return app;
}
