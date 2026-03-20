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

Vercel runs **serverless functions** or **static assets**, not a long-running Node process like `npm start` unless you use [Docker on Vercel](https://vercel.com/docs/deployments/docker) or a compatible adapter.

- **`FUNCTION_INVOCATION_FAILED` ([docs](https://vercel.com/docs/errors/FUNCTION_INVOCATION_FAILED))** means a serverless function **crashed** during invocation (e.g. uncaught exception, missing files, timeout). Check **Vercel → Project → Logs** for the real stack trace (often `ENOENT` for the OpenAPI file before this fix).
- This repo’s server loads `spec/insurancenow-20253.openapi.yaml` at startup. The server build runs `scripts/copy-spec.mjs` so `dist/spec/` ships with the compiled app—required when the deployment bundle does not include the whole monorepo.
- **Practical options:** (1) Deploy the **static UI** only (`gwire/web` build output) and host the API on Render/Fly/Docker; point the UI at that API via env/proxy. (2) Run the **full Fastify app** in **Docker** on a platform that supports containers. (3) Add a Vercel serverless wrapper (e.g. Fastify + AWS Lambda adapter) and ensure the build output includes `dist/spec`—see logs if invocation still fails.

## License

[MIT](LICENSE) for GWire code. The OpenAPI spec may be subject to Guidewire terms if you substitute the official document.
