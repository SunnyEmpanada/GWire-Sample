import test from "node:test";
import assert from "node:assert/strict";
import {
  customerSeedIndex,
  demoFillCandidateIds,
  isPolicyholderSubmitted,
  policyholderSubmissionKey,
  policyNumberSubmissionKey,
  shuffledIds,
} from "./submissionDemoFill.js";

test("isPolicyholderSubmitted matches SSN last4 + DOB", () => {
  const submitted = new Set([policyholderSubmissionKey("1234", "1965-03-12")]);
  assert.equal(isPolicyholderSubmitted(submitted, "1234", "1965-03-12"), true);
  assert.equal(isPolicyholderSubmitted(submitted, "5678", "1965-03-12"), false);
});

test("isPolicyholderSubmitted matches policy contract number", () => {
  const submitted = new Set([policyNumberSubmissionKey("PN-LIFE-CA-00042")]);
  assert.equal(
    isPolicyholderSubmitted(submitted, "9999", "1970-01-01", "PN-LIFE-CA-00042"),
    true
  );
  assert.equal(
    isPolicyholderSubmitted(submitted, "9999", "1970-01-01", "PN-LIFE-CA-00099"),
    false
  );
});

test("shuffledIds returns each id once", () => {
  const ids = shuffledIds(["CUST-00001", "CUST-00002", "CUST-00003"]);
  assert.equal(ids.length, 3);
  assert.deepEqual([...ids].sort(), ["CUST-00001", "CUST-00002", "CUST-00003"]);
});

test("demoFillCandidateIds keeps only in-memory ids present in primary", () => {
  const inMemory = ["CUST-00001", "CUST-00002", "CUST-00099"];
  const primary = new Set(["CUST-00001", "CUST-00003"]);
  const candidates = demoFillCandidateIds(inMemory, primary);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0], "CUST-00001");
});

test("customerSeedIndex parses CUST ids", () => {
  assert.equal(customerSeedIndex("CUST-00042"), 42);
  assert.equal(customerSeedIndex("CUST-00100"), 100);
  assert.equal(customerSeedIndex("invalid"), null);
});
