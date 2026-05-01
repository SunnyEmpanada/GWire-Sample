import test from "node:test";
import assert from "node:assert/strict";
import { buildMockStore, CALIFORNIA_COUNTIES } from "./seed.js";

test("seed has 100 California customers and 50/50 home vs auto", () => {
  assert.equal(CALIFORNIA_COUNTIES.length, 58);
  const s = buildMockStore(99);
  assert.equal(s.customers.length, 100);
  assert.equal(s.policies.length, 100);
  const home = s.policies.filter((p) => p.lineCd === "HOME");
  const auto = s.policies.filter((p) => p.lineCd === "PERSONAL_AUTO");
  assert.equal(home.length, 50);
  assert.equal(auto.length, 50);
  const customersByCounty = new Map<string, number>();
  for (const c of s.customers) {
    assert.equal(c.address.stateProvCd, "CA");
    assert.equal(c.address.countryCd, "US");
    assert.match(c.address.county, /.+/, "county should be set from city");
    customersByCounty.set(c.address.county, (customersByCounty.get(c.address.county) ?? 0) + 1);
  }
  for (const county of CALIFORNIA_COUNTIES) {
    assert.ok(
      (customersByCounty.get(county) ?? 0) >= 1,
      `at least one customer in county ${county}`
    );
  }
  for (const p of s.policies) {
    assert.equal(p.status, "IN_FORCE");
    assert.ok(
      p.expirationDt > "2026-04-01",
      "IN_FORCE policies should expire after April 2026"
    );
  }
});
