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

// ==============================================================
// GWire Extensions — NOT part of InsuranceNow emulation
// ==============================================================

type PolicyWithRisk = {
  systemId: string;
  lineCd: string;
  riskRanks: {
    theft: string | null;
    fire: string | null;
    flood: string | null;
    earthquake: string | null;
  };
};

/** Wipe the in-memory rank store so each test starts clean (store is a singleton). */
async function resetRisk(app: Awaited<ReturnType<typeof createApp>>) {
  await app.inject({ method: "DELETE", url: "/riskRankings" });
}

async function getPolicy(
  app: Awaited<ReturnType<typeof createApp>>,
  id: string
): Promise<PolicyWithRisk> {
  const res = await app.inject({ method: "GET", url: `/policies/${id}` });
  return JSON.parse(res.body) as PolicyWithRisk;
}

test("POST /policies/:id/riskRanking defaults category to THEFT", async () => {
  const app = await createApp();
  await resetRisk(app);
  const res = await app.inject({
    method: "POST",
    url: "/policies/POL-00001/riskRanking",
    payload: { rank: "LOW" },
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body) as { category: string; rank: string };
  assert.equal(body.category, "THEFT");
  assert.equal(body.rank, "LOW");
  const p = await getPolicy(app, "POL-00001");
  assert.equal(p.riskRanks.theft, "LOW");
  assert.equal(p.riskRanks.fire, null);
  await app.close();
});

test("POST /policies/:id/riskRanking accepts numeric rank and case-insensitive category", async () => {
  const app = await createApp();
  await resetRisk(app);
  const res = await app.inject({
    method: "POST",
    url: "/policies/POL-00002/riskRanking",
    payload: { rank: 2, category: "fire" },
  });
  assert.equal(res.statusCode, 200);
  const p = await getPolicy(app, "POL-00002");
  assert.equal(p.riskRanks.fire, "MEDIUM");
  assert.equal(p.riskRanks.theft, null);
  await app.close();
});

test("POST /policies/:id/riskRanking aliases WATER to FLOOD", async () => {
  const app = await createApp();
  await resetRisk(app);
  const res = await app.inject({
    method: "POST",
    url: "/policies/POL-00003/riskRanking",
    payload: { rank: 3, category: "WATER" },
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body) as { category: string; rank: string };
  assert.equal(body.category, "FLOOD");
  const p = await getPolicy(app, "POL-00003");
  assert.equal(p.riskRanks.flood, "HIGH");
  await app.close();
});

test("POST /policies/:id/riskRanking rejects invalid rank and invalid category", async () => {
  const app = await createApp();
  await resetRisk(app);
  const badRank = await app.inject({
    method: "POST",
    url: "/policies/POL-00004/riskRanking",
    payload: { rank: "SEVERE" },
  });
  assert.equal(badRank.statusCode, 400);
  const badCategory = await app.inject({
    method: "POST",
    url: "/policies/POL-00004/riskRanking",
    payload: { rank: "LOW", category: "PIRACY" },
  });
  assert.equal(badCategory.statusCode, 400);
  await app.close();
});

test("POST /policies/:id/riskRanking returns 404 for unknown policy", async () => {
  const app = await createApp();
  await resetRisk(app);
  const res = await app.inject({
    method: "POST",
    url: "/policies/POL-99999/riskRanking",
    payload: { rank: "LOW" },
  });
  assert.equal(res.statusCode, 404);
  await app.close();
});

test("POST /riskRankings bulk accepts valid and reports errors for invalid", async () => {
  const app = await createApp();
  await resetRisk(app);
  const res = await app.inject({
    method: "POST",
    url: "/riskRankings",
    payload: [
      { policySystemId: "POL-00005", rank: "HIGH" },
      { policySystemId: "POL-00006", rank: 1, category: "earthquake" },
      { policySystemId: "POL-99999", rank: "LOW" },
      { policySystemId: "POL-00007", rank: "BOGUS" },
    ],
  });
  assert.equal(res.statusCode, 207);
  const body = JSON.parse(res.body) as {
    accepted: Array<{ policySystemId: string; category: string; rank: string }>;
    errors: Array<{ policySystemId: string | null; error: string }>;
  };
  assert.equal(body.accepted.length, 2);
  assert.equal(body.errors.length, 2);
  const p5 = await getPolicy(app, "POL-00005");
  assert.equal(p5.riskRanks.theft, "HIGH");
  const p6 = await getPolicy(app, "POL-00006");
  assert.equal(p6.riskRanks.earthquake, "LOW");
  await app.close();
});

test("GET /policies always exposes all 4 riskRanks keys, null where unset", async () => {
  const app = await createApp();
  await resetRisk(app);
  await app.inject({
    method: "POST",
    url: "/policies/POL-00010/riskRanking",
    payload: { rank: "LOW", category: "FIRE" },
  });
  const list = await app.inject({ method: "GET", url: "/policies" });
  assert.equal(list.statusCode, 200);
  const body = JSON.parse(list.body) as { policies: PolicyWithRisk[] };
  const p10 = body.policies.find((p) => p.systemId === "POL-00010");
  assert.ok(p10);
  assert.deepEqual(Object.keys(p10!.riskRanks).sort(), [
    "earthquake",
    "fire",
    "flood",
    "theft",
  ]);
  assert.equal(p10!.riskRanks.fire, "LOW");
  assert.equal(p10!.riskRanks.theft, null);
  assert.equal(p10!.riskRanks.flood, null);
  assert.equal(p10!.riskRanks.earthquake, null);
  const nonHome = body.policies.find((p) => p.lineCd !== "HOME");
  assert.ok(nonHome);
  assert.equal(nonHome!.riskRanks.theft, null);
  await app.close();
});

test("DELETE /riskRankings wipes everything and is idempotent", async () => {
  const app = await createApp();
  await resetRisk(app);
  await app.inject({
    method: "POST",
    url: "/policies/POL-00011/riskRanking",
    payload: { rank: "MEDIUM" },
  });
  await app.inject({
    method: "POST",
    url: "/policies/POL-00012/riskRanking",
    payload: { rank: "HIGH", category: "FIRE" },
  });
  const first = await app.inject({ method: "DELETE", url: "/riskRankings" });
  assert.equal(first.statusCode, 200);
  const firstBody = JSON.parse(first.body) as { cleared: number };
  assert.equal(firstBody.cleared, 2);
  const p11 = await getPolicy(app, "POL-00011");
  assert.equal(p11.riskRanks.theft, null);
  const p12 = await getPolicy(app, "POL-00012");
  assert.equal(p12.riskRanks.fire, null);
  const second = await app.inject({ method: "DELETE", url: "/riskRankings" });
  assert.equal(second.statusCode, 200);
  const secondBody = JSON.parse(second.body) as { cleared: number };
  assert.equal(secondBody.cleared, 0);
  await app.close();
});

test("DELETE /riskRankings/:category clears one category, leaves others intact", async () => {
  const app = await createApp();
  await resetRisk(app);
  await app.inject({
    method: "POST",
    url: "/policies/POL-00020/riskRanking",
    payload: { rank: "LOW" },
  });
  await app.inject({
    method: "POST",
    url: "/policies/POL-00020/riskRanking",
    payload: { rank: "HIGH", category: "FIRE" },
  });
  await app.inject({
    method: "POST",
    url: "/policies/POL-00021/riskRanking",
    payload: { rank: "MEDIUM" },
  });
  const res = await app.inject({
    method: "DELETE",
    url: "/riskRankings/THEFT",
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body) as { category: string; cleared: number };
  assert.equal(body.category, "THEFT");
  assert.equal(body.cleared, 2);
  const p20 = await getPolicy(app, "POL-00020");
  assert.equal(p20.riskRanks.theft, null);
  assert.equal(p20.riskRanks.fire, "HIGH");
  const p21 = await getPolicy(app, "POL-00021");
  assert.equal(p21.riskRanks.theft, null);
  await app.close();
});

test("DELETE /riskRankings/water aliases to FLOOD", async () => {
  const app = await createApp();
  await resetRisk(app);
  await app.inject({
    method: "POST",
    url: "/policies/POL-00030/riskRanking",
    payload: { rank: "HIGH", category: "FLOOD" },
  });
  await app.inject({
    method: "POST",
    url: "/policies/POL-00030/riskRanking",
    payload: { rank: "LOW", category: "THEFT" },
  });
  const res = await app.inject({
    method: "DELETE",
    url: "/riskRankings/water",
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body) as { category: string; cleared: number };
  assert.equal(body.category, "FLOOD");
  assert.equal(body.cleared, 1);
  const p30 = await getPolicy(app, "POL-00030");
  assert.equal(p30.riskRanks.flood, null);
  assert.equal(p30.riskRanks.theft, "LOW");
  await app.close();
});

test("DELETE /riskRankings/bogus returns 400", async () => {
  const app = await createApp();
  await resetRisk(app);
  const res = await app.inject({
    method: "DELETE",
    url: "/riskRankings/bogus",
  });
  assert.equal(res.statusCode, 400);
  await app.close();
});
