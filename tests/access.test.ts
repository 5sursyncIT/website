import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clientID,
  isAdmin,
  owns,
  relationID,
  tenantRead,
} from "../src/lib/access";
import {
  validateFile,
  ticketSchema,
  contactSchema,
} from "../src/lib/validation";
const a = { id: 1, collection: "client-accounts", enabled: true, client: 10 };
const b = {
  id: 2,
  collection: "client-accounts",
  enabled: true,
  client: { id: 20 },
};
test("client boundaries reject other client, disabled account, anonymous and forged collection", () => {
  assert.equal(owns(a, { client: 10 }), true);
  assert.equal(owns(a, { client: 20 }), false);
  assert.equal(owns(b, { client: 10 }), false);
  assert.equal(owns({ ...a, enabled: false }, { client: 10 }), false);
  assert.equal(owns(null, { client: 10 }), false);
  assert.equal(owns({ ...a, collection: "users" }, { client: 10 }), false);
  assert.equal(isAdmin(a), false);
  assert.equal(isAdmin({ id: 9, collection: "admins" }), true);
  assert.equal(clientID(b), 20);
  assert.equal(relationID(undefined), null);
});
test("schemas reject client, author and role forgery", () => {
  const valid = {
    subject: "Incident Wi-Fi",
    category: "reseaux-cloud",
    description: "La connexion ne fonctionne plus.",
  };
  assert.equal(ticketSchema.safeParse(valid).success, true);
  for (const field of ["client", "author", "role", "status"])
    assert.equal(
      ticketSchema.safeParse({ ...valid, [field]: 20 }).success,
      false,
    );
});
test("contact validates honeypot, topic, email and lengths", () => {
  const valid = {
    name: "Test User",
    email: "test@example.test",
    topic: "autre",
    message: "Un besoin de test.",
  };
  assert.equal(contactSchema.safeParse(valid).success, true);
  assert.equal(
    contactSchema.safeParse({ ...valid, website: "spam" }).success,
    false,
  );
  assert.equal(
    contactSchema.safeParse({ ...valid, email: "invalid" }).success,
    false,
  );
  assert.equal(
    contactSchema.safeParse({ ...valid, message: "x".repeat(3001) }).success,
    false,
  );
});
test("file validation rejects forged MIME, HTML/SVG, path traversal and oversize", () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  assert.equal(validateFile(png, "image/png", "test.png").mime, "image/png");
  for (const [data, mime, name] of [
    [Buffer.from("<svg/>"), "image/png", "test.png"],
    [png, "image/png", "../test.png"],
    [png, "image/svg+xml", "test.svg"],
    [Buffer.alloc(5 * 1024 * 1024 + 1), "image/png", "big.png"],
    [png, "image/png", "test.html"],
  ] as const)
    assert.throws(() => validateFile(data, mime, name));
});
