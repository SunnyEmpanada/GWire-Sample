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
export const repoRoot = path.resolve(__dirname, "../../..");
export const specPath = path.join(repoRoot, "spec/insurancenow-20253.openapi.yaml");
export const webDist = path.join(repoRoot, "gwire/web/dist");

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
