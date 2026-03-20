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

  if (existsSync(webDist)) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: "/",
      index: ["index.html"],
    });
  }

  return app;
}
