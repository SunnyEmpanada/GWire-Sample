import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import type { OpenAPI } from "openapi-types";
import { loadSpec, listGetOperations, toFastifyPath } from "./openapi/loadSpec.js";
import { sampleJsonResponse } from "./openapi/sampleResponse.js";
import { buildMockStore } from "./domain/seed.js";
import { handleOverride } from "./domain/overrides.js";
import {
  clearCategory,
  normalizeCategory,
  normalizeRank,
  setRiskRank,
} from "./domain/extensions/riskRanking.js";

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

export async function createApp() {
  const spec = (await loadSpec(specPath)) as OpenAPI.Document;
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
    setRiskRank(store, systemId, category, rank);
    return reply.code(200).send({ policySystemId: systemId, category, rank });
  });

  // POST /riskRankings — bulk upsert. Body: [{ policySystemId, category?, rank }, ...]
  // Returns 200 when all items are accepted, 207 when some were rejected.
  app.post("/riskRankings", async (req, reply) => {
    const items = Array.isArray(req.body) ? (req.body as unknown[]) : [];
    const accepted: Array<{
      policySystemId: string;
      category: string;
      rank: string;
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
      setRiskRank(store, policySystemId, category, rank);
      accepted.push({ policySystemId, category, rank });
    }
    return reply
      .code(errors.length ? 207 : 200)
      .send({ accepted, errors });
  });

  // DELETE /riskRankings — wipe all ranks across all policies and categories.
  app.delete("/riskRankings", async (_req, reply) => {
    const cleared = store.riskRanks.size;
    store.riskRanks.clear();
    return reply.code(200).send({ cleared });
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
    const cleared = clearCategory(store, category);
    return reply.code(200).send({ category, cleared });
  });

  if (existsSync(webDist)) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: "/",
      index: ["index.html"],
    });
  }

  return app;
}
