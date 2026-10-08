import { test } from "node:test";
import assert from "node:assert/strict";
import { newInvitation, invitationHash } from "../src/lib/invitations";
test("invitation tokens are unique and only hashes are persisted", () => {
  const a = newInvitation();
  const b = newInvitation();
  assert.notEqual(a.token, b.token);
  assert.match(a.token, /^[a-f0-9]{64}$/);
  assert.equal(a.hash, invitationHash(a.token));
  assert.notEqual(a.hash, a.token);
  assert.ok(Date.parse(a.expiresAt) > Date.now());
});
