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

## License

[MIT](LICENSE) for GWire code. The OpenAPI spec may be subject to Guidewire terms if you substitute the official document.
