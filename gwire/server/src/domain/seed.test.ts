import test from "node:test";
import assert from "node:assert/strict";
import { buildMockStore } from "./seed.js";

test("seed has 100 California customers and 50/50 home vs auto", () => {
  const s = buildMockStore(99);
  assert.equal(s.customers.length, 100);
  assert.equal(s.policies.length, 100);
  const home = s.policies.filter((p) => p.lineCd === "HOME");
  const auto = s.policies.filter((p) => p.lineCd === "PERSONAL_AUTO");
  assert.equal(home.length, 50);
  assert.equal(auto.length, 50);
  for (const c of s.customers) {
    assert.equal(c.address.stateProvCd, "CA");
    assert.equal(c.address.countryCd, "US");
  }
});
