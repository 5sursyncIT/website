import "./guard";
import assert from "node:assert/strict";
import { getPayload } from "payload";
import config from "../src/payload.config";
const origin = "http://127.0.0.1:3106";
let checks = 0;
const p = await getPayload({ config });
const api = async (
  path: string,
  method = "GET",
  body?: unknown,
  cookie?: string,
) =>
  fetch(origin + path, {
    method,
    headers: {
      origin,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
try {
  const login = await api("/api/support/login", "POST", {
    email: "a@example.test",
    password: "fixture-only-not-a-real-password",
  });
  assert.equal(login.status, 200);
  checks++;
  const cookieA = login.headers.get("set-cookie")!.split(";")[0];
  const loginB = await api("/api/support/login", "POST", {
    email: "b@example.test",
    password: "fixture-only-not-a-real-password",
  });
  assert.equal(loginB.status, 200);
  checks++;
  const cookieB = loginB.headers.get("set-cookie")!.split(";")[0];
  const tickets = await (
    await api("/api/support/tickets", "GET", undefined, cookieA)
  ).json();
  const id = tickets.docs[0].id;
  assert.equal(
    (
      await api(
        `/api/support/tickets/${id}/replies`,
        "POST",
        { message: "IDOR" },
        cookieB,
      )
    ).status,
    404,
  );
  checks++;
  assert.equal(
    (await api("/api/cms/ticket-notes", "GET", undefined, cookieA)).status,
    403,
  );
  checks++;
  assert.equal(
    (
      await api(
        "/api/cms/client-accounts",
        "POST",
        { email: "forged@example.test", password: "x", name: "x", client: 2 },
        cookieA,
      )
    ).status,
    403,
  );
  checks++;
  assert.equal(
    (
      await api(
        "/api/support/tickets",
        "POST",
        {
          subject: "Forged",
          description: "Long enough text",
          category: "autre",
          client: 2,
        },
        cookieA,
      )
    ).status,
    400,
  );
  checks++;
  const file = await p.find({
    collection: "ticket-files",
    limit: 1,
    overrideAccess: true,
  });
  const fileID = file.docs[0].id;
  assert.equal(
    (await api(`/api/support/files/${fileID}`, "GET", undefined, cookieB))
      .status,
    404,
  );
  checks++;
  assert.equal((await api(`/api/support/files/${fileID}`)).status, 401);
  checks++;
  const fakeForm = new FormData();
  fakeForm.set("file", new File(["<svg/>"], "bad.png", { type: "image/png" }));
  const fakeUpload = await fetch(origin + `/api/support/tickets/${id}/files`, {
    method: "POST",
    headers: { origin, cookie: cookieA },
    body: fakeForm,
  });
  assert.equal(fakeUpload.status, 400);
  checks++;
  const wrongClient = await fetch(origin + `/api/support/tickets/${id}/files`, {
    method: "POST",
    headers: { origin, cookie: cookieB },
    body: fakeForm,
  });
  assert.equal(wrongClient.status, 404);
  checks++;
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  const validForm = new FormData();
  validForm.set("file", new File([png], "fixture.png", { type: "image/png" }));
  const validUpload = await fetch(origin + `/api/support/tickets/${id}/files`, {
    method: "POST",
    headers: { origin, cookie: cookieA },
    body: validForm,
  });
  assert.equal(validUpload.status, 201);
  checks++;
  const uploaded = await p.find({
    collection: "ticket-files",
    where: { name: { equals: "fixture.png" } },
    overrideAccess: true,
    limit: 1,
  });
  const downloaded = await api(
    `/api/support/files/${uploaded.docs[0].id}`,
    "GET",
    undefined,
    cookieA,
  );
  assert.equal(downloaded.status, 200);
  assert.equal(
    downloaded.headers.get("content-type"),
    "application/octet-stream",
  );
  assert.match(downloaded.headers.get("cache-control") || "", /no-store/);
  checks++;
  const staffLogin = await api("/api/cms/admins/login", "POST", {
    email: "admin@example.test",
    password: "fixture-only-not-a-real-password",
  });
  assert.equal(staffLogin.status, 200);
  const staffCookie = staffLogin.headers.get("set-cookie")!.split(";")[0];
  const clients = await p.find({
    collection: "clients",
    where: { name: { equals: "Fixture A" } },
    overrideAccess: true,
    limit: 1,
  });
  const inviteResponse = await api(
    "/api/team/invitations",
    "POST",
    {
      email: "invited@example.test",
      name: "Fixture invite",
      client: clients.docs[0].id,
    },
    staffCookie,
  );
  assert.equal(inviteResponse.status, 201);
  const invite = await inviteResponse.json();
  const token = invite.invitationURL.split("#")[1];
  checks++;
  const activation = await api("/api/support/activate", "POST", {
    token,
    password: "fixture-activation-password",
  });
  assert.equal(activation.status, 200);
  checks++;
  assert.equal(
    (
      await api("/api/support/activate", "POST", {
        token,
        password: "fixture-activation-password",
      })
    ).status,
    401,
  );
  checks++;
  const invitedLogin = await api("/api/support/login", "POST", {
    email: "invited@example.test",
    password: "fixture-activation-password",
  });
  assert.equal(invitedLogin.status, 200);
  checks++;
  assert.equal(
    (
      await api(
        "/api/team/invitations",
        "POST",
        { email: "bad@example.test", name: "Bad", client: clients.docs[0].id },
        cookieA,
      )
    ).status,
    403,
  );
  checks++;
  const reinviteActive = await api(
    "/api/team/invitations",
    "POST",
    { email: "invited@example.test", name: "Again", client: clients.docs[0].id },
    staffCookie,
  );
  assert.equal(reinviteActive.status, 409);
  checks++;
  const invitePending = async () =>
    (
      await api(
        "/api/team/invitations",
        "POST",
        { email: "Pending@example.test", name: "Pending", client: clients.docs[0].id },
        staffCookie,
      )
    ).json();
  const firstToken = (await invitePending()).invitationURL.split("#")[1];
  const secondToken = (await invitePending()).invitationURL.split("#")[1];
  assert.equal(
    (
      await api("/api/support/activate", "POST", {
        token: firstToken,
        password: "fixture-activation-password",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await api("/api/support/activate", "POST", {
        token: secondToken,
        password: "fixture-activation-password",
      })
    ).status,
    200,
  );
  checks++;
  for (const page of ["/support/nouveau", `/support/tickets/${id}`]) {
    const anonymous = await api(page);
    assert.equal(anonymous.status, 307, page);
    assert.match(anonymous.headers.get("location") || "", /\/support\/connexion$/);
    checks++;
  }
  assert.equal((await api("/team/invitations", "GET", undefined, cookieA)).status, 404);
  checks++;
  const contact = await api("/api/contact", "POST", {
    name: "Fixture contact",
    email: "contact@example.test",
    topic: "autre",
    message: "Test stockage durable avant notification",
  });
  assert.equal(contact.status, 201);
  const result = await contact.json();
  assert.equal(result.message, "Votre demande a été enregistrée.");
  checks++;
  const persisted = await p.find({
    collection: "contact-requests",
    overrideAccess: true,
    where: { email: { equals: "contact@example.test" } },
    limit: 1,
  });
  assert.equal(persisted.docs[0].notification, "not-configured");
  checks++;
  const logout=await api("/api/support/logout","POST",{},cookieA);assert.equal(logout.status,200);checks++;
  const replay=await api("/api/support/tickets","GET",undefined,cookieA);assert.equal(replay.status,401);checks++;
  console.log(
    `PASS ${checks} direct HTTP/API assertions: IDOR, files, roles, notes, invite, contact`,
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await p.destroy();
  process.exit(process.exitCode || 0);
}
