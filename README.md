# GWire

**GWire** is a lightweight mock of [Guidewire InsuranceNow](https://docs.guidewire.com/cloud/in/20253/apiref/)-style REST APIs. It serves **GET** endpoints driven by a committed OpenAPI document, returns **schema-shaped JSON** (examples when present, otherwise deterministic samples from response schemas), and layers **rich mock data** for California customers, policies, and claims.

## OpenAPI spec

The file [`spec/insurancenow-20253.openapi.yaml`](spec/insurancenow-20253.openapi.yaml) is a **representative** GET surface aligned with InsuranceNow patterns. If you have access to the **official** InsuranceNow 2025.3 OpenAPI export from Guidewire, you may replace this file (check your license for redistribution). The mock server loads whatever spec is at that path.

## Quick start

```bash
npm install
npm run dev
```

- API: `http://localhost:3000` (same origin as the UI)
- Portal: open the root URL in a browser

```bash
npm run build
npm start
```

## Project layout

| Path | Description |
|------|-------------|
| `spec/` | InsuranceNow-style OpenAPI (GET operations) |
| `gwire/server/` | Fastify app: spec-driven routes + domain overrides |
| `gwire/web/` | Vite + React portal (search customers, policies, claims) |

## Mock data

- **100** customers in **California**
- **50** home (`HOME`) and **50** auto (`PERSONAL_AUTO`) policies
- **0–2** claims per policy with varied status for rules testing

## Docker

```bash
docker build -t gwire .
docker run --rm -p 3000:3000 gwire
```

The container serves the REST API and the built portal on port **3000**.

## Deploy

Use any Node 20 host or container platform (Fly.io, Render, Azure App Service, etc.). Set `PORT` if the platform assigns a dynamic port.

### Vercel notes

The build log may show **warnings** that are not failures if you see **Build Completed**: Node `engines`, **`glob` deprecation** (transitive via `@fastify/static`; safe to ignore until upstream bumps it), and **TypeScript** compiling each `api/*.ts` entry. This repo pins **`engines.node` to `20.x`** and adds [`.nvmrc`](.nvmrc) so Vercel does not treat `>=20` as “always float to the newest major.” Local development may use Node 22/24; [`.npmrc`](.npmrc) sets `engine-strict=false` so `npm install` does not fail on that mismatch.

Vercel runs **serverless functions** or **static assets**, not a long-running Node process like `npm start` unless you use [Docker on Vercel](https://vercel.com/docs/deployments/docker) or a compatible adapter.

This repo includes **[`vercel.json`](vercel.json)** and **[`api/`](api/)** so deployments use a **default-export handler** that forwards each request into Fastify with **`app.inject()`** (Vercel passes Node `IncomingMessage`/`ServerResponse`, not a Lambda event — adapters like `serverless-http`’s default AWS mode can mis-read the URL as `/` and break routing). Rewrites send **`/(.*)` → `/api?t=$1`** so nested API paths (e.g. `/customers/:id/claims`) always hit **`api/index.ts`**; the handler rebuilds the path from `t` before `inject()`. **Project → Settings → Root Directory** must be the **repository root** (`.`). If Root Directory is set to `gwire/server`, Vercel may treat `src/app.ts` as a serverless entry: it has **no default export**, which triggers **“Invalid export … The default export must be a function or server”** and a failed invocation.

The API handler uses **`import()`** (dynamic) to load `gwire/server/dist/app.js` because Vercel’s Node builder often emits **CommonJS** for `api/*.ts`, while the server package is **ESM** — a static import becomes `require()` and fails at runtime with **`ERR_REQUIRE_ESM`**.

- **`FUNCTION_INVOCATION_FAILED` ([docs](https://vercel.com/docs/errors/FUNCTION_INVOCATION_FAILED))** means the function **crashed** (uncaught exception, missing files, timeout). Check **Logs** for the real error (e.g. `ENOENT` for the OpenAPI spec).
- The server build copies `spec/` into `gwire/server/dist/spec` (`copy-spec.mjs`); `vercel.json` **includeFiles** ensures that folder is bundled with `api/**/*.ts`.
- **Alternatives:** static UI only + API on Render/Fly/Docker; or full app in a **Docker** deployment on Vercel.

## License

[MIT](LICENSE) for GWire code. The OpenAPI spec may be subject to Guidewire terms if you substitute the official document.
