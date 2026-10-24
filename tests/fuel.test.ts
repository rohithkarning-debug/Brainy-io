// The "free fuel is out" message shows the pool's reset (midnight UTC) in the
// viewer's own timezone. Run with `npm test`.

import assert from "node:assert/strict";
import { test } from "node:test";
import { fuelOutMessage, fuelResetText, nextUtcMidnight } from "@/lib/format";

const at = new Date("2026-10-24T11:30:00Z"); // 5 PM in India

test("the next reset is the coming midnight UTC", () => {
  assert.equal(nextUtcMidnight(at).toISOString(), "2026-10-25T00:00:00.000Z");
});

test("India: 5:30 AM local, with midnight UTC alongside", () => {
  process.env.TZ = "Asia/Kolkata";
  const text = fuelResetText(at);
  assert.match(text, /^It resets at 5:30\s?(AM|am)/);
  assert.match(text, /\(midnight UTC\)\.$/);
});

test("New York: the local evening time instead", () => {
  process.env.TZ = "America/New_York";
  assert.match(fuelResetText(at), /^It resets at 8:00\s?(PM|pm).*\(midnight UTC\)\.$/);
});

test("UTC viewers just see midnight UTC", () => {
  process.env.TZ = "UTC";
  assert.equal(fuelResetText(at), "It resets at midnight UTC.");
});

test("the full message", () => {
  process.env.TZ = "Asia/Kolkata";
  const msg = fuelOutMessage(at);
  assert.match(msg, /^Free fuel is out for today\. It resets at 5:30/);
  assert.match(msg, /Add your own free key to keep going\.$/);
  assert.doesNotMatch(msg, /Try Quick/);
});
