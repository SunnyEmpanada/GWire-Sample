import test from "node:test";
import assert from "node:assert/strict";
import { headersForInject } from "./handler.js";

test("headersForInject drops content-type when payload is empty", () => {
  const headers = {
    "content-type": "application/octet-stream",
    "content-length": "0",
    host: "kog-gwire.vercel.app",
  };
  const out = headersForInject(headers, undefined);
  assert.equal(out["content-type"], undefined);
  assert.equal(out["content-length"], undefined);
  assert.equal(out.host, "kog-gwire.vercel.app");
});

test("headersForInject drops content-type for zero-length payload buffer", () => {
  const headers = { "content-type": "application/json" };
  const out = headersForInject(headers, Buffer.alloc(0));
  assert.equal(out["content-type"], undefined);
});

test("headersForInject keeps content-type when payload is present", () => {
  const headers = { "content-type": "application/json", "content-length": "2" };
  const out = headersForInject(headers, Buffer.from("{}"));
  assert.equal(out["content-type"], "application/json");
  assert.equal(out["content-length"], undefined);
});
