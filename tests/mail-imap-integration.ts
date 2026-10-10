// CRM ↔ Simafri mailbox (SMTP/IMAP) against a real IMAP server (Dovecot, tests/imap/) and a
// fake SMTP submission server (tests/fake-smtp.ts) on an internal Docker network, with a
// throwaway *_test PostgreSQL after migrations and certificates from a test authority.
// Fixture data and addresses only; nothing reaches Simafri; no mail leaves.
import "./guard";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Pool } from "pg";
import type { ImapFlow, ImapFlowOptions } from "imapflow";
import type { ImapConfig } from "../src/lib/mail/config";
import { ImapMailbox, MailServerError, smtpPhaseCode } from "../src/lib/mail/imap";
import { imapSyncAll } from "../src/lib/mail/imap-sync";
import { MailStore } from "../src/lib/mail/store";
import { parseMail, sha16 } from "../src/lib/mail/mime";
import {
  MailRefused, assign, attachment, confirmNotSent, discardDraft, history, prepareDraft, prepareReply, readDraft, readMessage, retrySentCopy,
  sendAuthorizedDraft, updateDraft, verifyDraft, type ImapDeps,
} from "../src/lib/mail/service";
import { startFakeSmtp } from "./fake-smtp";

const pool = new Pool({ connectionString: process.env.DATABASE_URI });
const q = (text: string, values?: unknown[]) => pool.query(text, values);
let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks++; console.log("PASS " + message); };
const refused = async (p: Promise<unknown>, re: RegExp, message: string) => {
  try { await p; } catch (e) { ok(e instanceof MailRefused && re.test(e.message), `${message} (${e instanceof Error ? e.message : e})`); return; }
  ok(false, message + " (not refused)");
};
const serverError = async (p: Promise<unknown>, code: string, message: string) => {
  try { await p; } catch (e) { ok(e instanceof MailServerError && e.code === code, `${message} (${e instanceof Error ? e.message : e})`); return; }
  ok(false, message + " (no error)");
};

const ADDRESS = "contact@crm.example.test", PASSWORD = "fixture-imap-pass";
const DRAFTS = "Brouillons perso", SENT = "Messages envoyés";
const ca = readFileSync("/certs/ca.crt", "utf8");
const fake = await startFakeSmtp({ key: readFileSync("/certs/smtp.key", "utf8"), cert: readFileSync("/certs/smtp.crt", "utf8"), user: ADDRESS, password: PASSWORD, port: 2587 });
const config: ImapConfig = {
  mailboxAddress: ADDRESS, displayName: "L’équipe 5/Sync IT", user: ADDRESS, password: () => PASSWORD,
  smtp: { host: "smtp.test", port: 2587 }, imap: { host: "imap.test", port: 993 }, ehloName: "localhost", ca, official: false, sinceDays: 90, sendAllowlist: undefined,
};
const logo = readFileSync("public/assets/logo-horizontal.jpeg");
const store = new MailStore(pool, ADDRESS);
const deps: ImapDeps = { kind: "imap", imap: new ImapMailbox(config), store, logo: () => logo };
const variant = (patch: Partial<ImapConfig>): ImapDeps => ({ ...deps, imap: new ImapMailbox({ ...config, ...patch }) });

// Direct IMAP access, playing the outside world (incoming mail, the webmail, the server).
const { ImapFlow: Client } = createRequire(import.meta.url)("imapflow") as { ImapFlow: new (o: ImapFlowOptions) => ImapFlow };
async function box<T>(work: (c: ImapFlow) => Promise<T>): Promise<T> {
  const c = new Client({ host: "imap.test", port: 993, secure: true, auth: { user: ADDRESS, pass: PASSWORD }, tls: { ca, servername: "imap.test" }, logger: false });
  await c.connect();
  try { return await work(c); } finally { await c.logout(); }
}
const mime = (h: Record<string, string>, body: string) => Buffer.from(Object.entries(h).map(([k, v]) => `${k}: ${v}`).join("\r\n") + "\r\n\r\n" + body.replace(/\r?\n/g, "\r\n"));
const ago = (days: number) => new Date(Date.now() - days * 86_400_000);
const deliver = (folder: string, h: Record<string, string>, body: string, date?: Date) => box((c) => c.append(folder, mime({ "MIME-Version": "1.0", "Content-Type": "text/plain; charset=utf-8", ...h }, body), [], date));
const inFolder = (folder: string, messageId: string) => box(async (c) => {
  await c.mailboxOpen(folder, { readOnly: true });
  const uids = ((await c.search({ header: { "message-id": messageId } }, { uid: true })) || []) as number[];
  const msgs = uids.length ? await c.fetchAll(uids.join(","), { uid: true, flags: true, source: true }, { uid: true }) : [];
  return msgs.map((m) => ({ uid: m.uid, flags: m.flags ?? new Set<string>(), source: m.source! }));
});
const sends = () => fake.state.received.length;

try {
  const tag = randomUUID().slice(0, 8);
  const admin = async (level: string) => (await q(`INSERT INTO admins(name,email,hash,salt,mail_access,updated_at,created_at) VALUES($1,$2,'x','x',$3,NOW(),NOW()) RETURNING id`, [`Mail ${level}`, `imap-${level}-${tag}@example.test`, level])).rows[0].id;
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
  const hot = await contact(gamma, "Testeur Hotmail Fixture", "testeur@hotmail.example.test");

  // ---- Connection security: certificate and host name always verified ----
  const probe = (d: ImapDeps) => d.imap.session(async (_, f) => f);
  await serverError(probe(variant({ ca: undefined })), "imap-tls", "IMAP: certificate of an unknown authority refused");
  await serverError(probe(variant({ imap: { host: "wrong-imap.test", port: 993 } })), "imap-tls", "IMAP: certificate for another host name refused (mail.crm.5sursync.com case)");
  await serverError(probe(variant({ password: () => "wrong-password" })), "imap-auth", "IMAP: wrong password refused");
  const folders = await probe(deps);
  ok(folders.drafts === DRAFTS && folders.sent === SENT, `folders found by SPECIAL-USE attributes, not by name (${folders.drafts} / ${folders.sent}; decoys Drafts and Sent ignored)`);
  ok(folders.uidplus, "server announces UIDPLUS");
  await serverError(probe(variant({ sentPath: "Introuvable" })), "folder-not-found", "explicitly configured folder must exist");

  // ---- Initial synchronisation: 90 days, exact links only, read state untouched ----
  const awaId = `<awa-1-${tag}@alpha.example.test>`;
  await deliver("INBOX", { From: "Awa <Awa@Alpha.example.test>", To: ADDRESS, Subject: "Demande de devis", "Message-ID": awaId, Date: ago(2).toUTCString() }, "Bonjour, pouvez-vous nous chiffrer ?", ago(2));
  await deliver("INBOX", { From: "qui@inconnu.example.test", To: ADDRESS, Subject: "Inconnu", "Message-ID": `<inc-${tag}@x.test>` }, "x", ago(3));
  await deliver("INBOX", { From: "partage@shared.example.test", To: ADDRESS, Subject: "Adresse partagée", "Message-ID": `<sh-${tag}@x.test>` }, "x", ago(4));
  await deliver("INBOX", { From: "awa@alpha.example.test", To: ADDRESS, Subject: "Trop ancien", "Message-ID": `<old-${tag}@x.test>` }, "x", ago(120));
  await deliver("INBOX", { From: "awa@alpha.example.test", To: ADDRESS, Subject: "Sans identifiant" }, "pas de Message-ID", ago(1));
  const withFiles = `<files-${tag}@alpha.example.test>`;
  await box((c) => c.append("INBOX", mime({
    From: "awa@alpha.example.test", To: ADDRESS, Subject: "Avec pièces jointes", "Message-ID": withFiles, "MIME-Version": "1.0",
    "Content-Type": 'multipart/mixed; boundary="m1"',
  }, `--m1
Content-Type: multipart/related; boundary="r1"

--r1
Content-Type: text/html; charset=utf-8

<p onclick="x()">Voir le devis <img src="cid:img1"></p><script>alert(1)</script>
--r1
Content-Type: image/png
Content-ID: <img1>
Content-Disposition: inline
Content-Transfer-Encoding: base64

iVBORw0KGgo=
--r1--
--m1
Content-Type: application/pdf; name="devis.pdf"
Content-Disposition: attachment; filename="devis.pdf"
Content-Transfer-Encoding: base64

JVBERi0xLjQKJSBmaXh0dXJlCg==
--m1--
`), [], ago(1)));
  await deliver(SENT, { From: ADDRESS, To: "info@alpha.example.test", Subject: "Offre webmail", "Message-ID": `<wm-${tag}@crm.example.test>` }, "x", ago(1));
  await deliver(SENT, { From: ADDRESS, To: "prospect@beta.example.test", Subject: "Relance prospect", "Message-ID": `<rp-${tag}@crm.example.test>` }, "x", ago(1));
  const r1 = await imapSyncAll(deps.imap, store);
  const count = async () => Number((await q(`SELECT count(*) FROM crm_mail.messages WHERE provider='imap'`)).rows[0].count);
  ok(r1.results.every((r) => r.complete && !r.error), `initial round complete for Inbox and Sent (${JSON.stringify(r1.results)})`);
  ok(await count() === 7, "7 messages within 90 days, the 120-day-old one excluded");
  const link = async (subject: string) => (await q(`SELECT m.link_state, m.has_attachments, m.imap_uid, m.conversation_id, l.client_id, l.contact_id, l.method FROM crm_mail.messages m LEFT JOIN crm_mail.links l ON l.message_id=m.id WHERE m.subject=$1 AND m.provider='imap'`, [subject])).rows[0];
  const a = await link("Demande de devis");
  ok(a.client_id === alpha && a.contact_id === awa && a.method === "auto", "exact contact address → contact and company (case ignored)");
  ok((await link("Offre webmail")).link_state === "ambiguous", "company general address alone: manual attribution");
  ok((await link("Inconnu")).link_state === "unknown" && (await link("Adresse partagée")).link_state === "ambiguous", "unknown and duplicated addresses left for manual attribution");
  ok((await link("Relance prospect")).contact_id === prospect, "message sent from the webmail linked to its single contact");
  ok((await link("Avec pièces jointes")).has_attachments === true && (await link("Demande de devis")).has_attachments === false, "attachments detected from the structure (inline image not counted)");
  const unseen = () => box(async (c) => { await c.mailboxOpen("INBOX", { readOnly: true }); return (await c.fetchAll("1:*", { flags: true })).every((m) => !m.flags?.has("\\Seen")); });
  ok(await unseen(), "synchronisation left every message unread");

  // ---- Incremental: no duplicate, new, removed; interrupted; UIDVALIDITY change ----
  const r2 = await imapSyncAll(deps.imap, store);
  ok(await count() === 7 && r2.results.every((r) => r.seen === 0), "second round: nothing new, no duplicate");
  await deliver("INBOX", { From: "awa@alpha.example.test", To: ADDRESS, Subject: "Nouveau message", "Message-ID": `<new-${tag}@alpha.example.test>`, References: awaId, "In-Reply-To": awaId }, "Suite", new Date());
  await box(async (c) => { await c.mailboxOpen("INBOX"); const [u] = (await c.search({ subject: "Inconnu" }, { uid: true })) as number[]; await c.messageDelete(String(u), { uid: true }); });
  const r3 = await imapSyncAll(deps.imap, store);
  ok(await count() === 8 && r3.results[0].seen === 1 && r3.results[0].removed === 1, `one new message, one removal (${JSON.stringify(r3.results[0])})`);
  ok((await q(`SELECT removed_at FROM crm_mail.messages WHERE subject='Inconnu' AND provider='imap'`)).rows[0].removed_at !== null, "deleted in the webmail → marked, history kept");
  ok((await link("Nouveau message")).conversation_id === (await link("Demande de devis")).conversation_id, "reply joins the thread of the message it answers (In-Reply-To / References)");
  for (let i = 0; i < 5; i++) await deliver("INBOX", { From: "qui@inconnu.example.test", To: ADDRESS, Subject: `Lot ${i}`, "Message-ID": `<lot-${i}-${tag}@x.test>` }, "x", new Date());
  const r4 = await imapSyncAll(deps.imap, store, 1, 2);
  const inboxState = async () => (await q(`SELECT last_uid, uidvalidity FROM crm_mail.sync_state WHERE folder='imap-inbox'`)).rows[0];
  const pausedAt = Number((await inboxState()).last_uid);
  ok(!r4.results[0].complete && r4.results[0].seen === 2, "interrupted round: 2 of 5 taken, progress saved");
  const r5 = await imapSyncAll(deps.imap, store);
  ok(r5.results[0].complete && r5.results[0].seen === 3 && Number((await inboxState()).last_uid) > pausedAt, "next round resumes after the last UID saved");
  ok(await count() === 13, "after resumption: each message exactly once");
  const sentBefore = await box(async (c) => { await c.mailboxOpen(SENT, { readOnly: true }); return (await c.fetchAll("1:*", { source: true })).map((m) => m.source!); });
  const oldValidity = (await q(`SELECT uidvalidity FROM crm_mail.sync_state WHERE folder='imap-sentitems'`)).rows[0].uidvalidity;
  await box(async (c) => { await c.mailboxDelete(SENT); await c.mailboxCreate(SENT); for (const s of sentBefore) await c.append(SENT, s, ["\\Seen"]); });
  await assign(deps, assistant, (await q(`SELECT id FROM crm_mail.messages WHERE subject='Offre webmail'`)).rows[0].id, alpha, null);
  const r6 = await imapSyncAll(deps.imap, store);
  const newValidity = (await q(`SELECT uidvalidity FROM crm_mail.sync_state WHERE folder='imap-sentitems'`)).rows[0].uidvalidity;
  ok(r6.results[1].reset && newValidity !== oldValidity, `UIDVALIDITY change detected (${oldValidity} → ${newValidity}), folder re-read`);
  ok(await count() === 13 && (await q(`SELECT count(*) FROM crm_mail.messages WHERE folder='sentitems' AND provider='imap' AND removed_at IS NULL AND imap_uidvalidity=$1`, [newValidity])).rows[0].count === "2", "no duplicate after the UIDVALIDITY change, locations updated");
  ok((await link("Offre webmail")).method === "manual" && (await link("Offre webmail")).client_id === alpha, "manual attribution kept across the UIDVALIDITY change");

  // ---- Reading: on demand, active content removed, attachments, read state kept ----
  const filesRow = (await q(`SELECT id FROM crm_mail.messages WHERE internet_message_id=$1`, [withFiles])).rows[0].id;
  const html = await readMessage(deps, reader, filesRow, "html");
  ok(html && !/<script|onclick/i.test(html.body) && html.body.includes("Voir le devis"), "HTML view: scripts and handlers removed");
  ok(html && html.attachments.length === 1 && html.attachments[0].name === "devis.pdf", "attachment listed, inline image not listed");
  const file = await attachment(deps, reader, filesRow, html!.attachments[0].id);
  ok(file && Buffer.from(file.bytes).toString().startsWith("%PDF-1.4"), "attachment downloaded with its exact content");
  ok(await attachment(deps, reader, filesRow, "0-0000000000000000") === null, "unknown attachment identifier refused");
  ok(await unseen(), "reading in the CRM left every message unread (BODY.PEEK, EXAMINE)");

  // ---- Drafts: rights, Drafts folder, one signature, one logo, attachments ----
  await refused(prepareDraft(deps, reader, { clientId: alpha, contactId: awa, to: "awa@alpha.example.test", subject: "x", text: "y" }), /Rédaction non autorisée/, "reader cannot draft");
  const phrase = `Phrase-unique-${tag}`;
  const pdf = { filename: "offre.pdf", contentType: "application/pdf", content: Buffer.from("%PDF-1.4\n% offre fixture\n") };
  const d1 = await prepareDraft(deps, assistant, { clientId: alpha, contactId: awa, to: "awa@alpha.example.test", subject: "Proposition", text: `Bonjour Awa,\n${phrase}` }, [pdf]);
  const d1Row = (await store.draft(d1))!;
  let copies = await inFolder(DRAFTS, d1Row.internet_message_id!);
  ok(copies.length === 1 && copies[0].flags.has("\\Draft"), "draft stored once in the Drafts folder with the \\Draft flag (visible in the webmail)");
  const signed = async (source: Buffer) => {
    const m = await parseMail(source);
    const html = String(m.html);
    return {
      m, html,
      signatures: html.split("sync5-signature").length - 1, logoRefs: html.split("cid:sync5-logo").length - 1,
      logoParts: m.attachments.filter((x) => x.cid === "sync5-logo").length, textSignatures: (m.text ?? "").split("L’équipe 5/Sync IT").length - 1,
    };
  };
  let s1 = await signed(copies[0].source);
  ok(s1.html.includes(phrase) && s1.signatures === 2 && s1.logoRefs === 1 && s1.logoParts === 1 && s1.textSignatures === 1, "one signature (HTML and text), one logo reference, one logo part");
  ok(s1.html.includes("contact@crm.example.test") && !s1.html.includes("contact@5sursync.com") && s1.html.includes("WhatsApp +221 76 881 30 39"), "signature shows the mailbox address and the WhatsApp number");
  ok(s1.m.from?.value[0].address === ADDRESS && s1.m.from?.value[0].name === "L’équipe 5/Sync IT" && s1.m.replyTo?.value[0].address === ADDRESS, "From and Reply-To: L’équipe 5/Sync IT <contact@…>");
  ok(s1.m.attachments.some((x) => x.filename === "offre.pdf" && x.contentDisposition === "attachment"), "chosen attachment included");
  ok(/multipart\/alternative/i.test(copies[0].source.toString()) && s1.m.text?.includes(phrase), "MIME: text and HTML alternatives");
  ok(sends() === 0, "saving a draft sent nothing");
  await updateDraft(deps, assistant, d1, { to: "awa@alpha.example.test", subject: "Proposition v2", text: `Bonjour Awa,\n${phrase} (corrigé)` },
    [{ filename: "annexe.txt", contentType: "text/plain", content: Buffer.from("annexe") }], []);
  copies = await inFolder(DRAFTS, d1Row.internet_message_id!);
  s1 = await signed(copies[0].source);
  ok(copies.length === 1 && s1.html.includes("(corrigé)") && s1.signatures === 2 && s1.logoParts === 1, "re-saved: replaced in place (old version removed), still one signature and one logo");
  ok(s1.m.attachments.filter((x) => x.contentDisposition === "attachment").map((x) => x.filename).sort().join() === "annexe.txt,offre.pdf", "attachments kept and added");
  await updateDraft(deps, assistant, d1, { to: "awa@alpha.example.test", subject: "Proposition v3", text: `Bonjour Awa,\n${phrase} (v3)` }, [], ["annexe.txt"]);
  s1 = await signed((await inFolder(DRAFTS, d1Row.internet_message_id!))[0].source);
  ok(s1.m.attachments.filter((x) => x.contentDisposition === "attachment").map((x) => x.filename).join() === "offre.pdf", "attachment removed on request");
  ok((await store.draft(d1))!.attachments.map((x) => x.name).join() === "offre.pdf", "attachment names (not contents) recorded in the CRM");
  const rd = await readDraft(deps, assistant, d1);
  ok(rd?.text?.endsWith("(v3)") && !rd.outlookEdited && !rd.missing, "draft text read back from the mailbox");
  await refused(prepareDraft(deps, assistant, { clientId: null, contactId: null, to: "a@b.example.test", subject: "x", text: "y" }, [{ filename: "outil.exe", contentType: "application/octet-stream", content: Buffer.from("MZ") }]), /Type de fichier refusé/, "executable attachment refused");
  await refused(prepareDraft(deps, assistant, { clientId: null, contactId: null, to: "a@b.example.test", subject: "x", text: "y" }, [{ filename: "gros.pdf", contentType: "application/pdf", content: Buffer.alloc(5 * 1024 * 1024) }]), /4 Mo/, "attachments over 4 MB refused");

  // ---- Reply in the thread ----
  const newRow = (await q(`SELECT id, conversation_id FROM crm_mail.messages WHERE subject='Nouveau message'`)).rows[0];
  const d2 = await prepareReply(deps, assistant, newRow.id, "Merci pour votre message.");
  const r2Row = (await store.draft(d2))!;
  const replySrc = await signed((await inFolder(DRAFTS, r2Row.internet_message_id!))[0].source);
  ok(r2Row.kind === "reply" && r2Row.conversation_id === newRow.conversation_id && r2Row.to_addresses.join() === "awa@alpha.example.test", "reply drafted in the same conversation, to the sender");
  ok(replySrc.m.inReplyTo === `<new-${tag}@alpha.example.test>` && String(replySrc.m.references).includes(awaId) && String(replySrc.m.references).includes(`<new-${tag}@alpha.example.test>`), "In-Reply-To and References set for the recipient's client");
  ok(replySrc.m.subject === "RE: Nouveau message" && replySrc.html.includes("sync5-quote") && replySrc.signatures === 2, "subject RE:, original quoted, one signature");

  // ---- Drafts changed outside the CRM are never overwritten nor sent ----
  await box(async (c) => {
    const [mine] = await inFolder(DRAFTS, r2Row.internet_message_id!);
    await c.append(DRAFTS, Buffer.from(mine.source.toString().replace("Merci pour votre message.", "Modifié dans le webmail.")), ["\\Draft", "\\Seen"]);
    await c.mailboxOpen(DRAFTS);
    await c.messageDelete(String(mine.uid), { uid: true });
  });
  await refused(updateDraft(deps, assistant, d2, { to: "awa@alpha.example.test", subject: "RE: x", text: "écrase" }), /modifié dans le webmail/, "draft edited in the webmail is never overwritten");
  const edited = await readDraft(deps, assistant, d2);
  ok(edited?.outlookEdited === true, "draft page shows it was edited elsewhere");

  // ---- Send: rights, acceptance list, sender, recipients checked on the server side ----
  config.sendAllowlist = undefined;
  await refused(sendAuthorizedDraft(deps, assistant, d1), /réservé/, "drafts-only account cannot send");
  await refused(sendAuthorizedDraft(deps, owner, d1), /pas encore ouvert/, "sending closed without an acceptance list");
  config.sendAllowlist = ["test@example.test", "prospect@beta.example.test", "testeur@hotmail.example.test", "refuse@example.test"];
  await refused(sendAuthorizedDraft(deps, owner, d1), /hors de la liste de recette/, "recipient outside the acceptance list refused before any SMTP connection");
  await refused(sendAuthorizedDraft(deps, owner, d2), /modifié dans le webmail/, "draft edited elsewhere cannot be sent");
  const forged = async (headers: Record<string, string>) => {
    const id = `<forged-${randomUUID()}@crm.example.test>`;
    await box((c) => c.append(DRAFTS, mime({ "MIME-Version": "1.0", "Content-Type": "text/plain", "Message-ID": id, To: "test@example.test", Subject: "Forgé", ...headers }, "x"), ["\\Draft"]));
    const [m] = await inFolder(DRAFTS, id);
    const uv = await box(async (c) => (await c.mailboxOpen(DRAFTS, { readOnly: true })).uidValidity);
    return store.insertDraft({ graphId: `imap-draft:${id}`, internetMessageId: id, conversationId: id, changeKey: `${uv}:${m.uid}:${sha16(m.source)}`, kind: "new", replyTo: null, clientId: null, contactId: null,
      to: ["test@example.test"], cc: [], subject: "Forgé", adminId: assistant.id, channel: "crm", provider: "imap" });
  };
  await refused(sendAuthorizedDraft(deps, owner, await forged({ From: "ydiop@5sursync.com" })), /expéditeur de ce brouillon est ydiop@5sursync\.com/, "other account in From: send blocked");
  await refused(sendAuthorizedDraft(deps, owner, await forged({ From: ADDRESS, Sender: "ydiop@5sursync.com" })), /expéditeur réel \(sender\)/, "other account in Sender: send blocked");
  await refused(sendAuthorizedDraft(deps, owner, await forged({ From: ADDRESS, Bcc: "cache@example.test" })), /Cci/, "hidden copy (Bcc): send blocked");
  await refused(sendAuthorizedDraft(deps, owner, await forged({ From: ADDRESS, To: "autre@example.test" })), /hors de la liste de recette/, "recipients taken from the message itself, not from the CRM row");
  const graphDraft = await store.insertDraft({ graphId: `AAMk-${tag}`, internetMessageId: null, conversationId: null, changeKey: null, kind: "new", replyTo: null, clientId: null, contactId: null, to: ["test@example.test"], cc: [], subject: "Ancien Graph", adminId: assistant.id, channel: "crm" });
  await refused(sendAuthorizedDraft(deps, owner, graphDraft), /ancienne messagerie Microsoft 365/, "Microsoft draft can never leave through Simafri");
  ok(sends() === 0 && fake.state.connections === 0, "no SMTP connection for any refused attempt");

  // ---- TLS and authentication failures on SMTP: nothing transmitted ----
  const tlsDraft = await prepareDraft(deps, assistant, { clientId: null, contactId: null, to: "test@example.test", subject: "TLS", text: "x" });
  ok(await sendAuthorizedDraft(variant({ smtp: { host: "wrong-smtp.test", port: 2587 }, sendAllowlist: config.sendAllowlist }), owner, tlsDraft) === "failed"
    && (await store.draft(tlsDraft))!.failure_code === "smtp-tls", "SMTP: certificate for another host name refused, failed, nothing sent");
  ok(await verifyDraft(deps, owner, tlsDraft) === "draft", "verification: draft still there, back to draft");
  const untrusted = await variant({ ca: undefined }).imap.smtpSession(async () => "connected", (phase, e) => `${phase}:${smtpPhaseCode(phase, e)}`);
  ok(untrusted === "connect:smtp-tls", `SMTP: unknown authority refused during STARTTLS, before authentication (${untrusted})`);
  const badLogin = await variant({ password: () => "wrong-password" }).imap.smtpSession(async () => "connected", (phase, e) => `${phase}:${smtpPhaseCode(phase, e)}`);
  ok(badLogin === "auth:smtp-auth-535" && fake.state.authFailures === 1, `SMTP: wrong password refused before any message (${badLogin})`);
  ok(sends() === 0, "nothing reached the SMTP server");

  // ---- Accepted, copy in Sent, draft removed, no double send ----
  const toTest = await prepareDraft(deps, assistant, { clientId: alpha, contactId: null, to: "test@example.test", subject: "Recette", text: "Test." }, [pdf]);
  const testId = (await store.draft(toTest))!.internet_message_id!;
  ok(await sendAuthorizedDraft(deps, owner, toTest) === "in_sent", "authorised send: accepted by SMTP, then copy in Sent");
  const sentRow = (await store.draft(toTest))!;
  ok(sentRow.state === "in_sent" && sentRow.sent_copy === "saved" && sentRow.accepted_at !== null, "states recorded: accepted, copy saved");
  ok(sends() === 1 && fake.state.received[0].from === ADDRESS && fake.state.received[0].to.join() === "test@example.test" && fake.state.received[0].user === ADDRESS, "exactly one SMTP transaction, envelope from the mailbox, server-checked recipients");
  const wire = await signed(fake.state.received[0].raw);
  ok(wire.signatures === 2 && wire.logoParts === 1 && wire.m.messageId === testId && wire.m.attachments.some((x) => x.filename === "offre.pdf"), "sent bytes: one signature, one logo, attachment, same Message-ID");
  ok(!/^Bcc:/im.test(fake.state.received[0].raw.toString()), "no Bcc header on the wire");
  ok((await inFolder(SENT, testId)).length === 1 && (await inFolder(DRAFTS, testId)).length === 0, "one copy in Sent, draft removed from Drafts");
  await refused(sendAuthorizedDraft(deps, owner, toTest), /pas prêt/, "second click cannot send twice");
  await imapSyncAll(deps.imap, store);
  ok((await inFolder(SENT, testId)).length === 1 && (await store.draft(toTest))!.state === "in_sent", "synchronisation: still one copy in Sent");
  ok((await q(`SELECT l.method, l.client_id FROM crm_mail.messages m JOIN crm_mail.links l ON l.message_id=m.id WHERE m.internet_message_id=$1 AND m.folder='sentitems'`, [testId])).rows[0]?.client_id === alpha, "sent copy linked to the draft's company");
  const sentCopyId = (await q(`SELECT id FROM crm_mail.messages WHERE internet_message_id=$1 AND folder='sentitems'`, [testId])).rows[0].id;
  await assign(deps, assistant, sentCopyId, gamma, null);
  await box(async (c) => { await c.mailboxRename(SENT, "Envoyés temp"); await c.mailboxRename("Envoyés temp", SENT); });
  await imapSyncAll(deps.imap, store);
  ok((await q(`SELECT l.method, l.client_id FROM crm_mail.messages m JOIN crm_mail.links l ON l.message_id=m.id WHERE m.id=$1`, [sentCopyId])).rows[0].client_id === gamma, "manual re-attribution of a sent copy kept by later synchronisations");
  const ev = (await q(`SELECT action, admin_id FROM crm_mail.events WHERE draft_id=$1 ORDER BY id`, [toTest])).rows.map((e) => e.action);
  ok(ev[0] === "prepare" && ev.includes("send-accepted") && ev.includes("sent-copy-saved") && ev.includes("draft-removed"), `journal: ${ev.join(", ")}`);

  // Server that saves its own copy in Sent: the CRM finds it and does not add a second one.
  fake.state.onAccepted = (r) => box(async (c) => { await c.append(SENT, r.raw, ["\\Seen"]); });
  const autoCopy = await prepareDraft(deps, assistant, { clientId: null, contactId: null, to: "test@example.test", subject: "Copie serveur", text: "x" });
  ok(await sendAuthorizedDraft(deps, owner, autoCopy) === "in_sent" && (await store.draft(autoCopy))!.sent_copy === "found", "copy already saved by the server: found, not appended");
  ok((await inFolder(SENT, (await store.draft(autoCopy))!.internet_message_id!)).length === 1, "no duplicate copy in Sent");
  fake.state.onAccepted = null;

  // Accepted by SMTP, copy in Sent impossible: accepted, never resent; copy only on request.
  fake.state.onAccepted = async () => { config.sentPath = "Introuvable"; };
  const noCopy = await prepareDraft(deps, assistant, { clientId: null, contactId: null, to: "test@example.test", subject: "Copie impossible", text: "x" });
  const before = sends();
  ok(await sendAuthorizedDraft(deps, owner, noCopy) === "accepted" && (await store.draft(noCopy))!.sent_copy === "failed", "copy failed: state stays « accepted by SMTP », failure recorded");
  fake.state.onAccepted = null;
  delete config.sentPath;
  await refused(sendAuthorizedDraft(deps, owner, noCopy), /pas prêt/, "no new send possible");
  ok(await retrySentCopy(deps, owner, noCopy) === "in_sent" && sends() === before + 1, "copy saved on request, message not sent again");
  ok((await inFolder(SENT, (await store.draft(noCopy))!.internet_message_id!)).length === 1, "exactly one copy in Sent after the retry");

  // ---- SMTP errors ----
  fake.setMode("reject-rcpt");
  const rejected = await prepareDraft(deps, assistant, { clientId: null, contactId: null, to: "test@example.test", subject: "Rejeté", text: "x" });
  ok(await sendAuthorizedDraft(deps, owner, rejected) === "failed" && (await store.draft(rejected))!.failure_code === "smtp-550-rcpt", "recipient refused (550): failed, nothing accepted");
  ok(await verifyDraft(deps, owner, rejected) === "draft", "verification: back to draft for a person to decide");
  fake.setMode("tempfail-data");
  ok(await sendAuthorizedDraft(deps, owner, rejected) === "failed" && /^smtp-451/.test((await store.draft(rejected))!.failure_code ?? ""), "temporary refusal (451): failed, not retried");
  await verifyDraft(deps, owner, rejected);
  fake.setMode("partial");
  const partial = await prepareDraft(deps, assistant, { clientId: null, contactId: null, to: "test@example.test, refuse@example.test", subject: "Partiel", text: "x" });
  ok(await sendAuthorizedDraft(deps, owner, partial) === "in_sent", "one recipient refused, the other accepted: accepted");
  const pRow = (await store.draft(partial))!;
  ok(pRow.delivery_failed_for.join() === "refuse@example.test" && pRow.delivery_failure_kind === "address", "refused recipient shown on the send (address unknown)");
  fake.setMode("drop-after-data");
  const dropped = await prepareDraft(deps, assistant, { clientId: null, contactId: null, to: "test@example.test", subject: "Coupé", text: "x" });
  const beforeDrop = sends();
  ok(await sendAuthorizedDraft(deps, owner, dropped) === "uncertain", "connection cut after the message was handed over: uncertain");
  await refused(sendAuthorizedDraft(deps, owner, dropped), /pas prêt/, "uncertain: no new attempt");
  ok(await verifyDraft(deps, owner, dropped) === "uncertain", "verification proves nothing (draft still present): stays uncertain");
  await refused(confirmNotSent(deps, assistant, dropped), /réservé/, "only a sender may declare it not sent");
  await confirmNotSent(deps, owner, dropped);
  ok((await store.draft(dropped))!.state === "draft" && sends() === beforeDrop + 1, "declared not sent by a person: back to draft, nothing sent by that action");
  fake.setMode("ok");

  // ---- Delivery reports: address unknown vs transport blocked ----
  const toProspect = await prepareDraft(deps, assistant, { clientId: beta, contactId: prospect, to: "prospect@beta.example.test", subject: "Offre prospect", text: "x" });
  await sendAuthorizedDraft(deps, owner, toProspect);
  const toHot = await prepareDraft(deps, assistant, { clientId: gamma, contactId: hot, to: "testeur@hotmail.example.test", subject: "Test Hotmail", text: "x" });
  await sendAuthorizedDraft(deps, owner, toHot);
  const pId = (await store.draft(toProspect))!.internet_message_id!, hId = (await store.draft(toHot))!.internet_message_id!;
  const sendsBefore = sends();
  const report = (rcpt: string, status: string, diag: string, original: string) => box((c) => c.append("INBOX", mime({
    From: "Mail Delivery System <MAILER-DAEMON@mx.example.test>", To: ADDRESS, Subject: "Mail delivery failed: returning message to sender",
    "Message-ID": `<ndr-${randomUUID()}@mx.example.test>`, "MIME-Version": "1.0", "Content-Type": 'multipart/report; report-type=delivery-status; boundary="b1"',
  }, `--b1
Content-Type: text/plain

This message was created automatically by mail delivery software.
  ${rcpt}
    ${diag}
--b1
Content-Type: message/delivery-status

Reporting-MTA: dns; mx.example.test

Action: failed
Final-Recipient: rfc822;${rcpt}
Status: ${status}
Diagnostic-Code: smtp; ${diag}

--b1
Content-Type: text/rfc822-headers

Message-ID: ${original}
Subject: x
--b1--
`), []));
  await report("prospect@beta.example.test", "5.1.1", "550 5.1.1 <prospect@beta.example.test>: User unknown", pId);
  await report("testeur@hotmail.example.test", "5.7.708", "550 5.7.708 Service unavailable. Access denied, traffic not accepted from this IP", hId);
  await imapSyncAll(deps.imap, store);
  const ndr = async (rcpt: string) => (await q(`SELECT m.is_ndr, m.ndr_kind, m.ndr_recipients, l.contact_id FROM crm_mail.messages m LEFT JOIN crm_mail.links l ON l.message_id=m.id WHERE m.is_ndr AND m.ndr_recipients ? $1`, [rcpt])).rows[0];
  const n1 = await ndr("prospect@beta.example.test"), n2 = await ndr("testeur@hotmail.example.test");
  ok(n1?.ndr_kind === "address" && n1.contact_id === prospect, "5.1.1 report: address unknown, linked to the prospect");
  ok(n2?.ndr_kind === "transport" && n2.contact_id === hot, "5.7.708 report: transport blocked, linked to the contact");
  ok((await store.suppressed(["prospect@beta.example.test", "testeur@hotmail.example.test"])).size === 1 && (await store.suppressed(["prospect@beta.example.test"])).size === 1, "only the unknown address is blocked; the transport block blocks nobody");
  const dp = (await store.draft(toProspect))!, dh = (await store.draft(toHot))!;
  ok(dp.delivery_failed_at && dp.delivery_failure_kind === "address" && dh.delivery_failed_at && dh.delivery_failure_kind === "transport", "failures put on the exact sent messages (Message-ID of the report), kinds kept");
  ok(dp.state === "in_sent" && dh.state === "in_sent", "accepted / copy in Sent / delivery failure stay three distinct facts");
  const again = await prepareDraft(deps, assistant, { clientId: beta, contactId: prospect, to: "prospect@beta.example.test", subject: "Relance", text: "x" });
  await refused(sendAuthorizedDraft(deps, owner, again), /non-remise/, "unknown address blocked for any new send");
  const hotAgain = await prepareDraft(deps, assistant, { clientId: gamma, contactId: hot, to: "testeur@hotmail.example.test", subject: "Nouvel essai", text: "x" });
  ok(await sendAuthorizedDraft(deps, owner, hotAgain) === "in_sent" && sends() === sendsBefore + 1, "transport-blocked address still allowed after a person's decision; nothing resent automatically");

  // ---- Reply of the recipient: thread kept, linked by its exact address ----
  await deliver("INBOX", { From: "Testeur <testeur@hotmail.example.test>", To: ADDRESS, Subject: "RE: Test Hotmail", "Message-ID": `<reply-${tag}@hotmail.example.test>`, "In-Reply-To": hId, References: hId }, "Bien reçu.", new Date());
  await imapSyncAll(deps.imap, store);
  const reply = (await q(`SELECT m.conversation_id, l.contact_id, l.method FROM crm_mail.messages m LEFT JOIN crm_mail.links l ON l.message_id=m.id WHERE m.internet_message_id=$1`, [`<reply-${tag}@hotmail.example.test>`])).rows[0];
  ok(reply.contact_id === hot && reply.method === "auto" && reply.conversation_id === dh.conversation_id, "recipient's reply: same thread as the CRM message, linked to the contact automatically");

  // ---- Discard: only our own draft removed; nothing deleted otherwise ----
  const toDiscard = await prepareDraft(deps, assistant, { clientId: null, contactId: null, to: "test@example.test", subject: "À jeter", text: "x" });
  const discardId = (await store.draft(toDiscard))!.internet_message_id!;
  await discardDraft(deps, assistant, toDiscard);
  ok((await inFolder(DRAFTS, discardId)).length === 0 && (await store.draft(toDiscard))!.state === "discarded", "abandoned draft removed from Drafts (explicit action)");
  await discardDraft(deps, assistant, d2);
  ok((await box(async (c) => { await c.mailboxOpen(DRAFTS, { readOnly: true }); return ((await c.search({ header: { "message-id": r2Row.internet_message_id! } }, { uid: true })) || []).length; })) === 1, "draft edited in the webmail kept in the mailbox when abandoned in the CRM");
  const inboxCount = await box(async (c) => { const st = await c.status("INBOX", { messages: true }); return st ? st.messages : -1; });
  ok(inboxCount === 14, `no message deleted from the Inbox by the CRM except the one removed by the webmail (${inboxCount})`);

  // ---- Storage promise and history ----
  const dump = JSON.stringify((await q(`SELECT (SELECT json_agg(m) FROM crm_mail.messages m) a, (SELECT json_agg(d) FROM crm_mail.drafts d) b, (SELECT json_agg(e) FROM crm_mail.events e) c`)).rows);
  ok(!dump.includes(phrase) && !dump.includes("chiffrer") && !dump.includes("User unknown") && !dump.includes("JVBERi0") && !dump.includes(PASSWORD), "no body, report text, attachment content or password stored");
  const h = await history(deps, reader, { clientId: alpha });
  ok(h.messages.length >= 4 && h.drafts.length >= 2, "company history: received, sent (CRM and webmail) and drafts");
  console.log(`${checks} checks passed`);
} finally {
  await fake.close();
  await pool.end();
}
