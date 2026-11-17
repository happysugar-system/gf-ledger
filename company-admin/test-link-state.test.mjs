import test from "node:test";
import assert from "node:assert/strict";
import {createState, transition, canView} from "./test-link-state.mjs";
test("link, unlink, relink to another test company", () => {
  const a = transition(createState(), "link", "TEST-A");
  assert.equal(canView(a, "TEST-A"), true);
  assert.equal(canView(a, "TEST-B"), false);
  const b = transition(a, "unlink");
  assert.equal(canView(b, "TEST-A"), false);
  const c = transition(b, "link", "TEST-B");
  assert.equal(canView(c, "TEST-B"), true);
  assert.equal(canView(c, "TEST-A"), false);
  assert.equal(c.history.length, 3);
});
test("switch removes access to old company", () => {
  const a = transition(createState(), "link", "TEST-A");
  const b = transition(a, "switch", "TEST-B");
  assert.equal(canView(b, "TEST-A"), false);
  assert.equal(canView(b, "TEST-B"), true);
});
test("reject double linking and invalid company", () => {
  const a = transition(createState(), "link", "TEST-A");
  assert.throws(() => transition(a, "link", "TEST-B"));
  assert.throws(() => transition(createState(), "link", "real-company"));
  assert.throws(() => transition(createState(), "unlink"));
});
