import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./app.js";

test("GET /customers returns JSON list", async () => {
  const app = await createApp();
  const res = await app.inject({ method: "GET", url: "/customers" });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["content-type"] ?? "", /application\/json/);
  const body = JSON.parse(res.body) as { customers: { openClaimCount?: number }[] };
  assert.ok(Array.isArray(body.customers));
  assert.equal(body.customers.length, 100);
  assert.ok(typeof body.customers[0]?.openClaimCount === "number");
  assert.ok(body.customers[0]!.openClaimCount! >= 0);
  await app.close();
});

test("GET /addresses/countries returns JSON", async () => {
  const app = await createApp();
  const res = await app.inject({ method: "GET", url: "/addresses/countries" });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body) as { countries?: unknown[] };
  assert.ok(Array.isArray(body.countries));
  await app.close();
});

test("GET unknown customer returns 404", async () => {
  const app = await createApp();
  const res = await app.inject({ method: "GET", url: "/customers/CUST-99999" });
  assert.equal(res.statusCode, 404);
  await app.close();
});

test("GET /customers/:id/claims returns JSON list", async () => {
  const app = await createApp();
  const res = await app.inject({ method: "GET", url: "/customers/CUST-00001/claims" });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body) as { claims: { systemId: string }[] };
  assert.ok(Array.isArray(body.claims));
  assert.ok(body.claims.length >= 1);
  await app.close();
});

test("GET /claims/:id/consumerSummary returns JSON", async () => {
  const app = await createApp();
  const res = await app.inject({
    method: "GET",
    url: "/claims/CLM-000001/consumerSummary",
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body) as { claimNumber: string; paidAmount: number };
  assert.ok(body.claimNumber.length > 0);
  assert.ok(typeof body.paidAmount === "number");
  await app.close();
});

test("GET /stats/summary returns aggregates", async () => {
  const app = await createApp();
  const res = await app.inject({ method: "GET", url: "/stats/summary" });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body) as {
    claimCounts: { open: number; closed: number; denied: number };
    totalPaidAllClaims: number;
    topCitiesByCustomers: { city: string; customerCount: number }[];
  };
  assert.ok(body.claimCounts.open >= 0);
  assert.ok(Array.isArray(body.topCitiesByCustomers));
  assert.equal(body.topCitiesByCustomers.length, 5);
  await app.close();
});

test("GET /openWork uses openapi-sampler fallback", async () => {
  const app = await createApp();
  const res = await app.inject({ method: "GET", url: "/openWork" });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body) as Record<string, unknown>;
  assert.ok("items" in body);
  await app.close();
});
