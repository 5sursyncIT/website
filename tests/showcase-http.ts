import "./guard";
import assert from "node:assert/strict";
// After integration.ts (fixture admin) and seed-content.ts, app on 3106.
const origin = "http://127.0.0.1:3106";
let checks = 0;
const json = { "content-type": "application/json", origin };
const page = async (path: string) => (await fetch(origin + path)).text();
const settle = () => new Promise((r) => setTimeout(r, 1500));
const login = await fetch(origin + "/api/cms/admins/login", {
  method: "POST",
  headers: json,
  body: JSON.stringify({
    email: "admin@example.test",
    password: "fixture-only-not-a-real-password",
  }),
});
assert.equal(login.status, 200);
const cookie = login.headers.get("set-cookie")!.split(";")[0];
const cms = (path: string, method: string, body?: unknown, auth = cookie) =>
  fetch(origin + "/api/cms/" + path, {
    method,
    headers: { ...json, ...(auth ? { cookie: auth } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
// Seeded content renders on both pages.
assert.match(await page("/realisations"), /INA Guinée[\s\S]*CNTS/);
assert.match(await page("/realisations"), /id="groupe-hage"[\s\S]*id="harmattan"/);
assert.match(await page("/"), /Mairie de Dakar/);
checks++;
// Logo upload through the admin media API, then a new project using it.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const form = new FormData();
form.set("file", new File([png], "logo-fixture.png", { type: "image/png" }));
form.set("_payload", JSON.stringify({ alt: "Logo fixture" }));
const upload = await fetch(origin + "/api/cms/media", {
  method: "POST",
  headers: { origin, cookie },
  body: form,
});
assert.equal(upload.status, 201);
const media = (await upload.json()).doc;
checks++;
const created = await cms("projects", "POST", {
  name: "Projet Fixture",
  country: "Sénégal",
  mission: "Mission de test",
  status: "ongoing",
  logo: media.id,
  order: 99,
});
assert.equal(created.status, 201);
const project = (await created.json()).doc;
await settle();
const listing = await page("/realisations");
assert.match(listing, /Projet Fixture[\s\S]*Mission de test/);
assert.match(listing, new RegExp(`/media/${media.filename}`));
assert.match(await page("/"), /Projet Fixture/);
checks++;
const image = await fetch(origin + "/media/" + media.filename);
assert.equal(image.status, 200);
assert.equal(image.headers.get("content-type"), "image/png");
assert.equal(image.headers.get("x-content-type-options"), "nosniff");
checks++;
for (const bad of ["..%2Fpayload.config.ts", "inconnu.png", ".env"]) {
  assert.equal((await fetch(origin + "/media/" + bad)).status, 404, bad);
}
checks++;
// Hidden from home only, then unpublished everywhere.
await cms(`projects/${project.id}`, "PATCH", { showOnHome: false });
await settle();
assert.doesNotMatch(await page("/"), /Projet Fixture/);
assert.match(await page("/realisations"), /Projet Fixture/);
checks++;
await cms(`projects/${project.id}`, "PATCH", { published: false });
await settle();
assert.doesNotMatch(await page("/realisations"), /Projet Fixture/);
checks++;
// Case study validation and deletion.
const badAnchor = await cms("case-studies", "POST", {
  client: "X",
  project: "Y",
  summary: "Z",
  anchor: "Pas valide!",
});
assert.equal(badAnchor.status, 400);
checks++;
const study = (
  await (
    await cms("case-studies", "POST", {
      client: "Client Fixture",
      project: "Étude",
      summary: "Résumé fixture",
      anchor: "client-fixture",
      tags: [{ label: "Test" }],
      order: 5,
    })
  ).json()
).doc;
await settle();
assert.match(await page("/realisations"), /id="client-fixture"/);
await cms(`case-studies/${study.id}`, "DELETE");
await settle();
assert.doesNotMatch(await page("/realisations"), /client-fixture/);
checks++;
// Anonymous writes refused.
assert.equal((await cms("projects", "POST", { name: "Anon" }, "")).status, 403);
assert.equal((await cms(`projects/${project.id}`, "DELETE", undefined, "")).status, 403);
checks++;
await cms(`projects/${project.id}`, "DELETE");
console.log(`PASS ${checks} showcase HTTP assertions: admin management, media, publication`);
process.exit(0);
