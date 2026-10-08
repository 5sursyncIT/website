// CRM ↔ contact@ against a local fake Graph (tests/fake-graph.ts) and a throwaway *_test
// PostgreSQL after migrations. Fixture data only; nothing reaches Microsoft; no mail leaves.
import "./guard";
import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { MailConfig } from "../src/lib/mail/config";
import { Graph, GraphError } from "../src/lib/mail/graph";
import { MailStore } from "../src/lib/mail/store";
import { checkNdrs, syncAll, syncFolder } from "../src/lib/mail/sync";
import { MailRefused, prepareDraft, prepareReply, readDraft, sendAuthorizedDraft, updateDraft, verifyDraft, assign, history } from "../src/lib/mail/service";
import { startFakeGraph } from "./fake-graph";

const pool = new Pool({ connectionString: process.env.DATABASE_URI });
const q = (text: string, values?: unknown[]) => pool.query(text, values);
let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks++; console.log("PASS " + message); };
const refused = async (p: Promise<unknown>, re: RegExp, message: string) => {
  try { await p; } catch (e) { ok(e instanceof MailRefused && re.test(e.message), `${message} (${e instanceof Error ? e.message : e})`); return; }
  ok(false, message + " (not refused)");
};
const TENANT = "17ea5f54-f67a-4949-b5b9-92a78a9d4fe7", MAILBOX = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", ADDRESS = "contact@5sursync.com";
const READ = "11111111-1111-1111-1111-111111111111", SEND = "22222222-2222-2222-2222-222222222222";
const keys = { read: generateKeyPairSync("rsa", { modulusLength: 2048 }), send: generateKeyPairSync("rsa", { modulusLength: 2048 }) };
const pem = (k: typeof keys.read) => k.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const fake = await startFakeGraph({ tenant: TENANT, mailbox: MAILBOX, mailboxAddress: ADDRESS, apps: { [READ]: { role: "read", key: keys.read.publicKey }, [SEND]: { role: "send", key: keys.send.publicKey } } });
const notAfter = new Date(Date.now() + 365 * 86_400_000);
const config: MailConfig = {
  tenantId: TENANT, mailboxId: MAILBOX, mailboxAddress: ADDRESS, graphBase: `${fake.url}/v1.0`, loginBase: fake.url, sinceDays: 90, sendAllowlist: undefined,
  read: { name: "read", clientId: READ, keyPem: pem(keys.read), thumbprint: "dGVzdA", notAfter },
  send: { name: "send", clientId: SEND, keyPem: pem(keys.send), thumbprint: "dGVzdA", notAfter },
};
const graph = new Graph(config);
const store = new MailStore(pool, ADDRESS);
const deps = { graph, store };
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
try {
  const tag = randomUUID().slice(0, 8);
  const admin = async (level: string) => (await q(`INSERT INTO admins(name,email,hash,salt,mail_access,updated_at,created_at) VALUES($1,$2,'x','x',$3,NOW(),NOW()) RETURNING id`, [`Mail ${level}`, `mail-${level}-${tag}@example.test`, level])).rows[0].id;
  const owner = { id: await admin("send"), level: "send" as const, channel: "crm" as const };
  const assistant = { id: await admin("draft"), level: "draft" as const, channel: "crm" as const };
  const reader = { id: await admin("read"), level: "read" as const, channel: "crm" as const };
  const client = async (name: string, email: string | null) => (await q(`INSERT INTO clients(name,stage,email,updated_at,created_at) VALUES($1,'prospect',$2,NOW(),NOW()) RETURNING id`, [name, email])).rows[0].id;
  const contact = async (clientId: number, name: string, email: string) => (await q(`INSERT INTO crm_contacts(name,client_id,email,"primary",updated_at,created_at) VALUES($1,$2,$3,false,NOW(),NOW()) RETURNING id`, [name, clientId, email])).rows[0].id;
  const alpha = await client("Alpha Fixture", "info@alpha.example.test");
  const beta = await client("Beta Fixture", null);
  const gamma = await client("Gamma Fixture", null);
  const awa = await contact(alpha, "Awa Fixture", "awa@alpha.example.test");
  await contact(beta, "Partagé Beta", "partage@shared.example.test");
  await contact(gamma, "Partagé Gamma", "partage@shared.example.test");
  const prospect = await contact(beta, "Prospect Fixture", "prospect@beta.example.test");

  // ---- Microsoft side: rights simulated as configured in Exchange RBAC ----
  await assert.rejects(graph.call("read", `${graph.mailbox}/messages/x/send`, { method: "POST" }), (e: unknown) => e instanceof GraphError && e.status === 403);
  ok(true, "read/draft application cannot send (403)");
  await assert.rejects(graph.call("send", `${graph.mailbox}/mailFolders/inbox/messages/delta`), (e: unknown) => e instanceof GraphError && e.status === 403);
  ok(true, "send application cannot read (403)");
  await assert.rejects(graph.call("read", `/users/autre-boite/messages`), (e: unknown) => e instanceof GraphError && e.status === 403);
  ok(true, "another mailbox refused (403)");

  // ---- Initial synchronisation: 90 days, several pages, exact links only ----
  const fromAwa = fake.add({ folder: "inbox", subject: "Demande de devis", from: { emailAddress: { address: "Awa@Alpha.example.test", name: "Awa" } }, toRecipients: [{ emailAddress: { address: ADDRESS } }], receivedDateTime: ago(2), body: "<p>Bonjour, pouvez-vous nous chiffrer ?</p>" });
  fake.add({ folder: "inbox", subject: "Inconnu", from: { emailAddress: { address: "qui@inconnu.example.test" } }, receivedDateTime: ago(3) });
  fake.add({ folder: "inbox", subject: "Adresse partagée", from: { emailAddress: { address: "partage@shared.example.test" } }, receivedDateTime: ago(4) });
  fake.add({ folder: "inbox", subject: "Trop ancien", from: { emailAddress: { address: "awa@alpha.example.test" } }, receivedDateTime: ago(120) });
  fake.add({ folder: "sentitems", subject: "Offre Outlook", from: { emailAddress: { address: ADDRESS } }, toRecipients: [{ emailAddress: { address: "info@alpha.example.test" } }], receivedDateTime: ago(1), sentDateTime: ago(1) });
  fake.add({ folder: "sentitems", subject: "Relance prospect", toRecipients: [{ emailAddress: { address: "prospect@beta.example.test" } }], receivedDateTime: ago(1) });
  const r1 = await syncAll(graph, store);
  const count = async () => Number((await q(`SELECT count(*) FROM crm_mail.messages`)).rows[0].count);
  ok(r1.results.every((r) => r.complete && !r.error), "initial round complete for inbox and sent items");
  ok(await count() === 5, "5 messages within 90 days, the 120-day-old one excluded");
  ok((await q(`SELECT 1 FROM crm_mail.sync_state WHERE delta_link IS NOT NULL AND next_link IS NULL`)).rowCount === 2, "deltaLink saved per folder");
  const link = async (subject: string) => (await q(`SELECT m.link_state, l.client_id, l.contact_id, l.method FROM crm_mail.messages m LEFT JOIN crm_mail.links l ON l.message_id=m.id WHERE m.subject=$1`, [subject])).rows[0];
  const a = await link("Demande de devis");
  ok(a.client_id === alpha && a.contact_id === awa && a.method === "auto", "exact contact address → contact and company (case ignored)");
  const outlook = await link("Offre Outlook");
  ok(outlook.link_state === "ambiguous" && outlook.client_id === null, "company general address alone: manual attribution, not automatic");
  ok((await link("Inconnu")).link_state === "unknown" && (await link("Adresse partagée")).link_state === "ambiguous", "unknown and duplicated addresses left for manual attribution");
  ok((await link("Relance prospect")).contact_id === prospect, "message sent from Outlook linked to its single contact");
  ok((await store.unassigned()).length === 3, "three messages in « À attribuer »");

  // ---- Incremental: no duplicate, new, removed; lost state; interrupted round ----
  await syncAll(graph, store);
  ok(await count() === 5, "second round: no duplicate");
  const late = fake.add({ folder: "inbox", subject: "Nouveau message", from: { emailAddress: { address: "awa@alpha.example.test" } }, receivedDateTime: new Date().toISOString() });
  fake.remove(fromAwa.id);
  const r2 = await syncAll(graph, store);
  ok(await count() === 6 && r2.results[0].seen === 1 && r2.results[0].removed === 1, "delta: one new message, one removal");
  ok((await q(`SELECT removed_at FROM crm_mail.messages WHERE graph_id=$1`, [fromAwa.id])).rows[0].removed_at !== null, "removed in Outlook → marked, history kept");
  fake.expireDelta();
  const r3 = await syncAll(graph, store);
  ok(r3.results.every((r) => r.reset), "lost sync state (410) detected and reset");
  const r4 = await syncFolder(graph, store, "inbox", 1);
  ok(!r4.complete && (await q(`SELECT next_link FROM crm_mail.sync_state WHERE folder='inbox'`)).rows[0].next_link, "interrupted round keeps its nextLink");
  await syncAll(graph, store);
  ok(await count() === 6, "resynchronised from the same initial date without duplicates");
  ok((await q(`SELECT 1 FROM crm_mail.messages WHERE graph_id=$1`, [late.id])).rowCount === 1, "new message still present once");

  // ---- Manual attribution ----
  const unknownId = (await q(`SELECT id FROM crm_mail.messages WHERE subject='Inconnu'`)).rows[0].id;
  await refused(assign(deps, reader, unknownId, alpha, null), /Rédaction non autorisée/, "reader cannot attribute");
  await refused(assign(deps, assistant, unknownId, alpha, prospect), /n’appartient pas/, "contact of another company refused");
  await assign(deps, assistant, unknownId, gamma, null);
  ok((await link("Inconnu")).method === "manual", "manual attribution recorded");
  ok((await q(`SELECT 1 FROM crm_mail.events WHERE action='link' AND admin_id=$1`, [assistant.id])).rowCount === 1, "attribution journaled with its author");
  await syncAll(graph, store);
  ok((await link("Inconnu")).method === "manual" && (await link("Inconnu")).client_id === gamma, "manual attribution kept by later synchronisations");

  // ---- Drafts: never sent, signature once, real thread ----
  await refused(prepareDraft(deps, reader, { clientId: alpha, contactId: awa, to: "awa@alpha.example.test", subject: "x", text: "y" }), /Rédaction non autorisée/, "reader cannot draft");
  await refused(prepareDraft(deps, assistant, { clientId: alpha, contactId: awa, to: "pas-une-adresse", subject: "x", text: "y" }), /Adresse invalide/, "invalid address refused");
  const phrase = `Phrase-unique-${tag}`;
  const d1 = await prepareDraft(deps, assistant, { clientId: alpha, contactId: awa, to: "awa@alpha.example.test", subject: "Proposition", text: `Bonjour Awa,\n${phrase}` });
  const draftState = () => fetch(`${fake.url}/_control/state`, { method: "POST" }).then((r) => r.json());
  let st = await draftState();
  const fd = st.drafts.find((x: { subject: string }) => x.subject === "Proposition");
  ok(fd && fd.body.includes(phrase) && fd.body.split("sync5-signature").length - 1 === 2 && fd.attachments.includes("sync5-logo"), "draft in contact@ with text, one signature and the inline logo");
  ok(st.sends.length === 0, "saving a draft sent nothing");
  await updateDraft(deps, assistant, d1, { to: "awa@alpha.example.test", subject: "Proposition v2", text: `Bonjour Awa,\n${phrase} (corrigé)` });
  st = await draftState();
  const fd2 = st.drafts.find((x: { subject: string }) => x.subject === "Proposition v2");
  ok(fd2 && fd2.body.includes("(corrigé)") && fd2.body.split("sync5-signature").length - 1 === 2 && st.sends.length === 0, "re-saved: text replaced, still one signature, nothing sent");
  const rd = await readDraft(deps, assistant, d1);
  ok(rd?.text?.endsWith("(corrigé)") && !rd.outlookEdited, "draft text read back from the mailbox");
  const replyTo = (await q(`SELECT id, conversation_id FROM crm_mail.messages WHERE subject='Nouveau message'`)).rows[0];
  const d2 = await prepareReply(deps, assistant, replyTo.id, "Merci pour votre message.");
  const r = await store.draft(d2);
  ok(r?.kind === "reply" && r.conversation_id === replyTo.conversation_id && r.to_addresses[0] === "awa@alpha.example.test", "reply prepared in the same conversation, to the sender");
  st = await draftState();
  const fr = st.drafts.find((x: { subject: string }) => x.subject === "RE: Nouveau message");
  ok(fr.body.includes("sync5-quote") && fr.body.split("sync5-signature").length - 1 === 2, "reply body: our text, one signature, quote");
  fake.editInOutlook(r!.graph_id);
  await refused(updateDraft(deps, assistant, d2, { to: "awa@alpha.example.test", subject: "RE: x", text: "écrase" }), /modifié dans Outlook/, "draft edited in Outlook is never overwritten");

  // ---- Send: authorised person, allowlist, states, no double send ----
  await refused(sendAuthorizedDraft(deps, assistant, d1), /réservé/, "drafts-only account cannot send");
  await refused(sendAuthorizedDraft(deps, owner, d1), /pas encore ouvert/, "sending closed without an acceptance list");
  config.sendAllowlist = ["test@example.test"];
  await refused(sendAuthorizedDraft(deps, owner, d1), /hors de la liste de recette/, "recipient outside the acceptance list refused before any call");
  ok((await draftState()).sends.length === 0, "nothing sent by refused attempts");
  const toTest = await prepareDraft(deps, assistant, { clientId: alpha, contactId: null, to: "test@example.test", subject: "Recette", text: "Test." });
  ok(await sendAuthorizedDraft(deps, owner, toTest) === "accepted", "authorised send: accepted by Microsoft (202)");
  await refused(sendAuthorizedDraft(deps, owner, toTest), /pas prêt/, "second click cannot send twice");
  await syncAll(graph, store);
  const sentRow = await store.draft(toTest);
  ok(sentRow?.state === "in_sent", "then found in Sent Items by the synchronisation");
  ok((await q(`SELECT l.method FROM crm_mail.messages m JOIN crm_mail.links l ON l.message_id=m.id WHERE m.graph_id=$1`, [sentRow!.graph_id])).rows[0]?.method === "draft", "sent copy linked to the draft's company");
  const ev = (await q(`SELECT action, admin_id FROM crm_mail.events WHERE draft_id=$1 ORDER BY id`, [toTest])).rows;
  ok(ev[0].action === "prepare" && ev[0].admin_id === assistant.id && ev.some((e) => e.action === "send-accepted" && e.admin_id === owner.id), "journal: prepared by the assistant, sent by the owner");
  for (const mode of ["after503", "drop"] as const) {
    await fetch(`${fake.url}/_control/send-mode`, { method: "POST", body: JSON.stringify({ mode }) });
    const d = await prepareDraft(deps, assistant, { clientId: alpha, contactId: null, to: "test@example.test", subject: `Incertain ${mode}`, text: "x" });
    const before = (await draftState()).sends.length;
    ok(await sendAuthorizedDraft(deps, owner, d) === "uncertain", `${mode}: result uncertain`);
    await refused(sendAuthorizedDraft(deps, owner, d), /pas prêt/, `${mode}: no new attempt while uncertain`);
    ok(await verifyDraft(deps, owner, d) === "in_sent" && (await draftState()).sends.length === before + 1, `${mode}: verification finds it in Sent Items, sent exactly once`);
  }
  await fetch(`${fake.url}/_control/send-mode`, { method: "POST", body: JSON.stringify({ mode: "fail400" }) });
  const d3 = await prepareDraft(deps, assistant, { clientId: alpha, contactId: null, to: "test@example.test", subject: "Refusé", text: "x" });
  ok(await sendAuthorizedDraft(deps, owner, d3) === "failed", "refused by Microsoft: failed");
  ok(await verifyDraft(deps, owner, d3) === "draft", "verification: still an unsent draft, back to draft for a person to decide");
  await fetch(`${fake.url}/_control/send-mode`, { method: "POST", body: JSON.stringify({ mode: "ok" }) });

  // ---- Non-delivery report: linked to the prospect, address blocked, no resend ----
  const sentToProspect = await prepareDraft(deps, assistant, { clientId: beta, contactId: prospect, to: "prospect@beta.example.test", subject: "Offre prospect", text: "x" });
  config.sendAllowlist = "*";
  await sendAuthorizedDraft(deps, owner, sentToProspect);
  await syncAll(graph, store);
  const sendsBefore = (await draftState()).sends.length;
  const ndr = fake.add({ folder: "inbox", subject: "Non remis : Offre prospect", from: { emailAddress: { address: "postmaster@5sursync.onmicrosoft.com" } }, receivedDateTime: new Date().toISOString(),
    messageClass: "REPORT.IPM.Note.NDR", body: "<p>Le message n’a pas pu être remis à prospect@beta.example.test.</p><p>550 5.1.1 User unknown</p>" });
  await syncAll(graph, store);
  await checkNdrs(graph, store);
  const ndrRow = (await q(`SELECT m.is_ndr, m.ndr_recipients, l.client_id, l.contact_id FROM crm_mail.messages m LEFT JOIN crm_mail.links l ON l.message_id=m.id WHERE m.graph_id=$1`, [ndr.id])).rows[0];
  ok(ndrRow.is_ndr && ndrRow.ndr_recipients[0] === "prospect@beta.example.test" && ndrRow.client_id === beta && ndrRow.contact_id === prospect, "report recognised and linked to the prospect");
  ok((await store.draft(sentToProspect))?.delivery_failed_at !== null, "delivery failure shown on the sent draft (distinct from accepted / in Sent Items)");
  const again = await prepareDraft(deps, assistant, { clientId: beta, contactId: prospect, to: "prospect@beta.example.test", subject: "Relance", text: "x" });
  await refused(sendAuthorizedDraft(deps, owner, again), /non-remise/, "rejected address blocked for any new send");
  ok((await draftState()).sends.length === sendsBefore, "no automatic resend after the report");

  // ---- Storage promise and history ----
  const dump = JSON.stringify((await q(`SELECT (SELECT json_agg(m) FROM crm_mail.messages m) a, (SELECT json_agg(d) FROM crm_mail.drafts d) b, (SELECT json_agg(e) FROM crm_mail.events e) c`)).rows);
  ok(!dump.includes(phrase) && !dump.includes("chiffrer") && !dump.includes("User unknown"), "no message body or report text stored in crm_mail");
  const h = await history(deps, reader, { clientId: alpha });
  ok(h.messages.length >= 3 && h.drafts.length >= 1, "company history: received, sent (CRM and Outlook) and drafts");
  ok(fake.state.tokens <= 4, `tokens cached (${fake.state.tokens} requested)`);

  // ---- Privileges: schema closed to PUBLIC, future objects included ----
  const role = `probe_${tag}`;
  await q(`CREATE ROLE ${role} NOLOGIN`);
  await q(`CREATE TABLE crm_mail.future_probe(id int)`);
  await q(`CREATE FUNCTION crm_mail.f_probe() RETURNS int LANGUAGE sql AS 'SELECT 1'`);
  const p = (await q(`SELECT has_schema_privilege($1,'crm_mail','USAGE') u, has_table_privilege($1,'crm_mail.messages','SELECT') t, has_table_privilege($1,'crm_mail.future_probe','SELECT') f`, [role])).rows[0];
  ok(!p.u && !p.t && !p.f, "PUBLIC: no USAGE on crm_mail, no right on its tables, including tables created later");
  // PostgreSQL keeps its global default EXECUTE-to-PUBLIC on new functions (it cannot be
  // revoked per schema): the absence of USAGE on the schema is what blocks the call.
  const conn = await pool.connect();
  await conn.query(`SET ROLE ${role}`);
  const call = await conn.query(`SELECT crm_mail.f_probe()`).then(() => "allowed", (e: Error) => e.message);
  const read = await conn.query(`SELECT count(*) FROM crm_mail.messages`).then(() => "allowed", (e: Error) => e.message);
  await conn.query(`RESET ROLE`);
  conn.release();
  ok(/permission denied for schema crm_mail/.test(call) && /permission denied for schema crm_mail/.test(read), `another role cannot call a crm_mail function nor read a table (${call})`);
  await q(`DROP TABLE crm_mail.future_probe; DROP FUNCTION crm_mail.f_probe(); DROP ROLE ${role}`);
  console.log(`${checks} checks passed`);
} finally {
  fake.close();
  await pool.end();
}
