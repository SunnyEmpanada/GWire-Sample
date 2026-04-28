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
 *
 * For mutating methods, the raw request body must be read and passed to `inject()` as
 * `payload`. Otherwise `Content-Type: application/json` with a non-zero
 * `Content-Length` causes Fastify to treat the request as malformed (400) because
 * no bytes are supplied to the parser.
 */
import type { FastifyInstance } from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";

type Req = IncomingMessage & { url?: string };

/** Read raw body from the Node request (Vercel passes an unconsumed stream). */
function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}

function headersForInject(
  headers: IncomingMessage["headers"],
  payload: Buffer | undefined
): Record<string, string | string[] | undefined> {
  const out = { ...headers } as Record<string, string | string[] | undefined>;
  if (payload !== undefined && payload.length > 0) {
    delete out["content-length"];
    delete out["transfer-encoding"];
  }
  return out;
}

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

  const method = (req.method ?? "GET").toUpperCase();
  const mayHaveBody = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  let payload: Buffer | undefined;
  if (mayHaveBody) {
    const buf = await readRequestBody(req);
    if (buf.length > 0) payload = buf;
  }

  const response = await app.inject({
    method,
    url,
    headers: headersForInject(req.headers, payload),
    ...(payload !== undefined ? { payload } : {}),
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
