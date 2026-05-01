# Supabase Risk Persistence

GWire can persist policy risk rankings in Supabase while keeping the app fast. The server hydrates an in-memory risk cache on startup, serves policy reads from that cache, and writes through to Supabase when the existing REST endpoints change risk data.

## Authentication Model

Use a server-side Supabase secret/service-role key from the Fastify API process. Do not expose this key to the React/Vite app.

Required server environment variables:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
RISK_PERSISTENCE=supabase
```

`SUPABASE_SECRET_KEY` is also accepted if you use Supabase's newer secret key format. `RISK_PERSISTENCE=memory` forces the original in-memory behavior for tests or offline development.

Never prefix these variables with `VITE_`; any `VITE_` value can be bundled into browser code.

## Table Setup

Create this table in the Supabase SQL editor:

```sql
create table if not exists public.policy_risks (
  policy_system_id text not null,
  category text not null check (category in ('THEFT', 'FIRE', 'FLOOD', 'EARTHQUAKE')),
  risk_level text null check (risk_level in ('LOW', 'MEDIUM', 'HIGH')),
  updated_at timestamptz not null default now(),
  primary key (policy_system_id, category)
);

alter table public.policy_risks enable row level security;
```

The app uses the server-side secret/service-role key, so it can manage this table without browser-facing policies. If you later expose this table directly to browser clients, add explicit RLS policies first.

## Seeding

When `RISK_PERSISTENCE=supabase`, the server seeds missing rows on startup:

- one row for every generated policy
- one row for every risk category
- `risk_level = null` for unassigned risks

With the current mock data, startup creates up to 400 rows: 100 policies x 4 categories. Existing assigned risk levels are not overwritten during seeding.

You can also inspect or pre-seed rows manually:

```sql
select policy_system_id, category, risk_level, updated_at
from public.policy_risks
order by policy_system_id, category;
```

## Local Setup

From the repository root:

```bash
npm install
```

Copy the sample environment file and edit the values:

```bash
cp .env.example .env
```

Set `RISK_PERSISTENCE=supabase` and fill in:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`

The app does not auto-load `.env`, so load it into your shell before starting local dev:

```bash
set -a; source .env; set +a
npm run dev
```

The portal remains at `http://localhost:5173`, and the API remains at `http://127.0.0.1:3100`.

## Vercel Setup

In Vercel, add these environment variables to the project:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`
- `RISK_PERSISTENCE=supabase`

Set them for every environment where risk data should persist. The variables are read by the serverless API handler only.

## REST Behavior

The existing GWire extension endpoints are unchanged:

- `POST /policies/{systemId}/riskRanking`
- `POST /riskRankings`
- `DELETE /riskRankings`
- `DELETE /riskRankings/{category}`

POST endpoints upsert assigned risk levels into `policy_risks`. DELETE endpoints keep seeded rows in place and set `risk_level` back to `null`, which the portal displays as `N/A`.

Policy reads stay fast because `GET /policies` and `GET /policies/{systemId}` read from the server's hydrated in-memory cache instead of querying Supabase on every request.

## Verify Persistence

1. Start the app with Supabase env vars set.
2. Set a risk:

```bash
curl -X POST "http://127.0.0.1:3100/policies/POL-00001/riskRanking" \
  -H "Content-Type: application/json" \
  -d '{"category":"THEFT","rank":"HIGH"}'
```

3. Confirm it is returned:

```bash
curl "http://127.0.0.1:3100/policies/POL-00001"
```

4. Restart the server and run the GET again. The risk should still be present because the cache rehydrates from Supabase.
5. Clear the category:

```bash
curl -X DELETE "http://127.0.0.1:3100/riskRankings/THEFT"
```

The corresponding rows remain in Supabase with `risk_level = null`.

