/**
 * Shared Vercel serverless handler: wraps Fastify with serverless-http.
 * Strips /api prefix so OpenAPI routes (/customers, …) match.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import serverless from "serverless-http";
import { createApp } from "../gwire/server/dist/app.js";

type Req = IncomingMessage & { url?: string };

let cached: ReturnType<typeof serverless>;

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

export default async function vercelHandler(req: Req, res: ServerResponse) {
  stripApiPrefix(req);

  if (!cached) {
    const app = await createApp();
    await app.ready();
    cached = serverless(app as Parameters<typeof serverless>[0]);
  }
  return cached(req, res);
}
