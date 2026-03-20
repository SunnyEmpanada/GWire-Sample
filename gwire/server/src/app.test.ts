import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./app.js";

test("GET /customers returns JSON list", async () => {
  const app = await createApp();
  const res = await app.inject({ method: "GET", url: "/customers" });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["content-type"] ?? "", /application\/json/);
  const body = JSON.parse(res.body) as { customers: unknown[] };
  assert.ok(Array.isArray(body.customers));
  assert.equal(body.customers.length, 100);
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

test("GET /openWork uses openapi-sampler fallback", async () => {
  const app = await createApp();
  const res = await app.inject({ method: "GET", url: "/openWork" });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body) as Record<string, unknown>;
  assert.ok("items" in body);
  await app.close();
});
