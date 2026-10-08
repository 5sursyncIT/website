import "./guard";
import assert from "node:assert/strict";
import { getPayload } from "payload";
import config from "../src/payload.config";
const p = await getPayload({ config });
let n = 0;
try {
  const admin = (await p.find({ collection: "admins", limit: 1, overrideAccess: true })).docs[0];
  const staff = { ...admin, collection: "admins" as const };
  for (const url of ["javascript:alert(1)", "http://facebook.com/x", "notaurl", "https://user:pw@evil.test/"]) {
    await assert.rejects(p.updateGlobal({ slug: "social-links", data: { links: [{ platform: "facebook", url }] }, user: staff, overrideAccess: false }), url); n++;
  }
  const client = (await p.find({ collection: "client-accounts", limit: 1, overrideAccess: true })).docs[0];
  await assert.rejects(p.updateGlobal({ slug: "social-links", data: { links: [{ platform: "facebook", url: "https://evil.test" }] }, user: { ...client, collection: "client-accounts" as const }, overrideAccess: false })); n++;
  await p.updateGlobal({ slug: "social-links", data: { links: [
    { platform: "facebook", url: "https://www.facebook.com/fixture-5sync" },
    { platform: "linkedin", url: "https://www.linkedin.com/company/fixture-5sync" },
    { platform: "whatsapp", url: "https://wa.me/221770972908" } ] }, user: staff, overrideAccess: false }); n++;
  const g = await p.findGlobal({ slug: "social-links", overrideAccess: false });
  assert.equal(g.links?.length, 3); n++;
  console.log(`PASS ${n} social-links assertions`);
} catch (e) { console.error(e); process.exitCode = 1 } finally { await p.destroy(); process.exit(process.exitCode || 0) }
