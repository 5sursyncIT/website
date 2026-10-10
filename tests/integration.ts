import "./guard";
import assert from "node:assert/strict";
import { getPayload, createLocalReq, registerFirstUserOperation } from "payload";
import config from "../src/payload.config";
import { type Identity } from "../src/lib/access";
const p = await getPayload({ config });
let checks = 0;
const check = (fn: () => void) => {
  fn();
  checks++;
};
try {
  // Same approved email and empty collection, but arriving through the public proxy.
  const proxiedReq = await createLocalReq(
    { req: { headers: new Headers({ "x-real-ip": "203.0.113.9" }) } },
    p,
  );
  await assert.rejects(
    registerFirstUserOperation({
      collection: p.collections.admins,
      req: proxiedReq,
      data: {
        name: "Proxied bootstrap",
        email: process.env.BOOTSTRAP_ADMIN_EMAIL!,
        password: "fixture-only-not-a-real-password",
        mailAccess: "none",
        role: "full",
      },
    }),
  );
  checks++;
  const admin = await p.create({
    collection: "admins",
    data: {
      name: "Fixture admin",
      email: "admin@example.test",
      password: "fixture-only-not-a-real-password",
      mailAccess: "none",
      role: "full",
    },
    overrideAccess: true,
  });
  const staff = { ...admin, collection: "admins" as const };
  const ca = await p.create({
    collection: "clients",
    data: { name: "Fixture A", stage: "client" },
    user: staff,
    overrideAccess: false,
  });
  const cb = await p.create({
    collection: "clients",
    data: { name: "Fixture B", stage: "client" },
    user: staff,
    overrideAccess: false,
  });
  const emptyClientReq=await createLocalReq({},p);
  await assert.rejects(registerFirstUserOperation({collection:p.collections["client-accounts"],req:emptyClientReq,data:{name:"Forbidden bootstrap",email:"bootstrap@example.test",password:"fixture-only-bootstrap-password",client:ca.id,enabled:true}}));checks++;
  const beforeAccounts=await p.count({collection:"client-accounts",overrideAccess:true});check(()=>assert.equal(beforeAccounts.totalDocs,0));
  const account = async (email: string, client: number) => ({
    ...(await p.create({
      collection: "client-accounts",
      data: {
        name: "Fixture",
        email,
        password: "fixture-only-not-a-real-password",
        client,
        enabled: true,
      },
      user: staff,
      overrideAccess: false,
    })),
    collection: "client-accounts" as const,
  });
  const a = await account("a@example.test", ca.id);
  const b = await account("b@example.test", cb.id);
  const ticket = await p.create({
    collection: "tickets",
    user: a,
    overrideAccess: false,
    data: {
      subject: "Fixture ticket A",
      category: "autre",
      priority: "normal" as const,
      description: "Description fixture suffisamment longue",
      client: cb.id,
      author: { relationTo: "admins", value: admin.id },
      status: "closed",
    },
  });
  check(() => assert.equal(ticket.client, ca.id));
  check(() => assert.equal(ticket.status, "open"));
  check(() => assert.equal(ticket.author.relationTo, "client-accounts"));
  const listed = await p.find({
    collection: "tickets",
    user: b,
    overrideAccess: false,
  });
  check(() => assert.equal(listed.totalDocs, 0));
  await assert.rejects(
    p.findByID({
      collection: "tickets",
      id: ticket.id,
      user: b,
      overrideAccess: false,
    }),
  );
  checks++;
  await assert.rejects(
    p.findByID({
      collection: "tickets",
      id: ticket.id,
      user: null,
      overrideAccess: false,
    }),
  );
  checks++;
  await assert.rejects(
    p.update({
      collection: "tickets",
      id: ticket.id,
      user: a,
      overrideAccess: false,
      data: { status: "closed", client: cb.id },
    }),
  );
  checks++;
  await assert.rejects(
    p.create({
      collection: "ticket-replies",
      user: b,
      overrideAccess: false,
      data: {
        ticket: ticket.id,
        client: cb.id,
        author: { relationTo: "client-accounts", value: b.id },
        message: "Forbidden",
      },
    }),
  );
  checks++;
  const reply = await p.create({
    collection: "ticket-replies",
    user: a,
    overrideAccess: false,
    data: {
      ticket: ticket.id,
      client: cb.id,
      author: { relationTo: "admins", value: admin.id },
      message: "Allowed",
    },
  });
  check(() => assert.equal(reply.client, ca.id));
  check(() => assert.equal(reply.author.relationTo, "client-accounts"));
  await p.create({
    collection: "ticket-notes",
    user: staff,
    overrideAccess: false,
    data: { ticket: ticket.id, note: "Internal only" },
  });
  await assert.rejects(
    p.find({ collection: "ticket-notes", user: a, overrideAccess: false }),
  );
  checks++;
  await assert.rejects(
    p.create({
      collection: "ticket-notes",
      user: a,
      overrideAccess: false,
      data: { ticket: ticket.id, note: "Denied" },
    }),
  );
  checks++;
  const f = await p.create({
    collection: "ticket-files",
    overrideAccess: true,
    data: {
      client: ca.id,
      ticket: ticket.id,
      name: "fixture.pdf",
      mime: "application/pdf",
      bytes: 8,
      storageKey: "00000000-0000-0000-0000-000000000000",
    },
  });
  await assert.rejects(
    p.findByID({
      collection: "ticket-files",
      id: f.id,
      user: b,
      overrideAccess: false,
    }),
  );
  checks++;
  const ownFile = await p.findByID({
    collection: "ticket-files",
    id: f.id,
    user: a,
    overrideAccess: false,
  });
  check(() => assert.equal(ownFile.storageKey, undefined));
  await assert.rejects(
    p.create({
      collection: "ticket-files",
      user: a,
      overrideAccess: false,
      data: {
        client: cb.id,
        ticket: ticket.id,
        name: "forged.pdf",
        mime: "application/pdf",
        bytes: 8,
        storageKey: "x",
      },
    }),
  );
  checks++;
  await assert.rejects(
    p.create({
      collection: "client-accounts",
      user: a,
      overrideAccess: false,
      data: {
        email: "forged@example.test",
        password: "bad",
        name: "Bad",
        client: cb.id,
      },
    }),
  );
  checks++;
  await assert.rejects(
    p.findByID({
      collection: "tickets",
      id: ticket.id,
      user: { ...a, enabled: false },
      overrideAccess: false,
    }),
  );
  checks++;
  console.log(
    `PASS ${checks} PostgreSQL/Payload isolation and role assertions`,
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await p.destroy();
  process.exit(process.exitCode || 0);
}
