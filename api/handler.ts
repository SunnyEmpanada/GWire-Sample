/**
 * Shared Vercel serverless handler: wraps Fastify with serverless-http.
 * Strips /api prefix so OpenAPI routes (/customers, …) match.
 *
 * Vercel compiles `api/*.ts` to CommonJS; `gwire/server/dist/app.js` is ESM.
 * A static `import` becomes `require()` and throws ERR_REQUIRE_ESM — use dynamic `import()`.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import serverless from "serverless-http";

type Req = IncomingMessage & { url?: string };

let cached: ReturnType<typeof serverless> | undefined;
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

async function ensureHandler() {
  if (cached) return;
  if (!initPromise) {
    initPromise = (async () => {
      const { createApp } = await import("../gwire/server/dist/app.js");
      const app = await createApp();
      await app.ready();
      cached = serverless(app as Parameters<typeof serverless>[0]);
    })();
  }
  await initPromise;
}

export default async function vercelHandler(req: Req, res: ServerResponse) {
  stripApiPrefix(req);
  await ensureHandler();
  return cached!(req, res);
}
