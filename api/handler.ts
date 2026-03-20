/**
 * Shared Vercel serverless handler: forwards Node `req` into Fastify via `inject()`.
 *
 * Vercel’s rewrite to `api/[...path]` does not reliably invoke the function for
 * multi-segment paths (e.g. `/customers/:id/claims` → 404). We rewrite everything to
 * `/api?t=<captured path>` so a single `api/index.ts` handler always runs; `t` is
 * turned back into the logical URL before `inject()`.
 *
 * Vercel compiles `api/*.ts` to CommonJS; `gwire/server/dist/app.js` is ESM — use
 * dynamic `import()` for `createApp`.
 */
import type { FastifyInstance } from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";

type Req = IncomingMessage & { url?: string };

let cached: FastifyInstance | undefined;
let initPromise: Promise<void> | null = null;

function stripApiPrefix(req: Req) {
  const raw = req.url;
  if (!raw) return;
  const q = raw.indexOf("?");
  const pathPart = q === -1 ? raw : raw.slice(0, q);
  const search = q === -1 ? "" : raw.slice(q);
  if (!pathPart.startsWith("/api")) return;
  const rest = pathPart.slice(4) || "/";
  const normalized = rest.startsWith("/") ? rest : `/${rest}`;
  req.url = search ? `${normalized}${search}` : normalized;
}

/** Path for Fastify: Vercel `t` query from rewrite, else `/api`-stripped `req.url`. */
function resolveLogicalUrl(req: Req): string {
  const raw = req.url || "/";
  const u = new URL(raw, "http://localhost");
  if (u.searchParams.has("t")) {
    const te = u.searchParams.get("t") ?? "";
    const path = te === "" ? "/" : `/${te.replace(/^\/+/, "")}`;
    u.searchParams.delete("t");
    const q = u.searchParams.toString();
    return path + (q ? `?${q}` : "");
  }
  stripApiPrefix(req);
  return req.url || "/";
}

async function ensureApp(): Promise<FastifyInstance> {
  if (cached) return cached;
  if (!initPromise) {
    initPromise = (async () => {
      const { createApp } = await import("../gwire/server/dist/app.js");
      const app = await createApp();
      await app.ready();
      cached = app;
    })();
  }
  await initPromise;
  return cached!;
}

export default async function vercelHandler(req: Req, res: ServerResponse) {
  const url = resolveLogicalUrl(req);
  const app = await ensureApp();

  const response = await app.inject({
    method: req.method ?? "GET",
    url,
    headers: req.headers as Record<string, string | string[] | undefined>,
  });

  res.statusCode = response.statusCode;
  for (const [key, value] of Object.entries(response.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) res.appendHeader(key, v);
    } else {
      res.setHeader(key, value);
    }
  }
  res.end(response.rawPayload);
}
