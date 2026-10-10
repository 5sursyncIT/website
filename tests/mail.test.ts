import { test } from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { canMail, mailLevel } from "../src/lib/mail/access";
import { mailStatus, parseAllowlist } from "../src/lib/mail/config";
import { clientAssertion } from "../src/lib/mail/graph";
import {
  companyDomain, composeBody, composeFromText, counterpartAddresses, decideLink, hasSignature, isLikelyNdr, isNdrClass,
  ndrFailedRecipients, parseRecipients, quoteHtml, sendRefusal, senderRefusal, signatureHtml, stripActiveHtml, SIGNATURE_MARK,
} from "../src/lib/mail/rules";
import { initialDeltaPath } from "../src/lib/mail/sync";
import { certThreshold } from "../src/lib/mail/worker";

test("mailbox rights: ordered levels, unknown values mean none", () => {
  assert.equal(mailLevel({ mailAccess: "draft" }), "draft");
  assert.equal(mailLevel({ mailAccess: "root" }), "none");
  assert.equal(mailLevel(null), "none");
  assert.ok(canMail({ mailAccess: "send" }, "draft") && canMail({ mailAccess: "draft" }, "read"));
  assert.ok(!canMail({ mailAccess: "draft" }, "send") && !canMail({ mailAccess: "read" }, "draft") && !canMail({}, "read"));
});

test("recipients: parsing, allowlist during acceptance, suppressed addresses, own mailbox", () => {
  assert.deepEqual(parseRecipients("A@Exemple.sn; b@x.sn, a@exemple.sn  pas-une-adresse"), { addresses: ["a@exemple.sn", "b@x.sn"], invalid: ["pas-une-adresse"] });
  const none = new Set<string>();
  assert.match(sendRefusal(["a@x.sn"], undefined, none, "contact@5sursync.com")!, /pas encore ouvert/);
  assert.match(sendRefusal(["a@x.sn"], ["test@x.sn"], none, "contact@5sursync.com")!, /hors de la liste de recette/);
  assert.equal(sendRefusal(["test@x.sn"], ["test@x.sn"], none, "contact@5sursync.com"), null);
  assert.equal(sendRefusal(["a@x.sn"], "*", none, "contact@5sursync.com"), null);
  assert.match(sendRefusal(["a@x.sn"], "*", new Set(["a@x.sn"]), "contact@5sursync.com")!, /non-remise/);
  assert.match(sendRefusal(["contact@5sursync.com"], "*", none, "contact@5sursync.com")!, /elle-même/);
  assert.match(sendRefusal([], "*", none, "contact@5sursync.com")!, /Aucun destinataire/);
  assert.equal(parseAllowlist(""), undefined);
});

test("sender: only contact@ may leave, in from and sender", () => {
  const box = "contact@5sursync.com";
  assert.equal(senderRefusal("Contact@5sursync.com", "contact@5sursync.com", box), null);
  assert.equal(senderRefusal("contact@5sursync.com", null, box), null);
  assert.match(senderRefusal(null, null, box)!, /n’a pas d’expéditeur contact@5sursync\.com/);
  assert.match(senderRefusal("ydiop@5sursync.com", "ydiop@5sursync.com", box)!, /expéditeur de ce brouillon est ydiop@5sursync\.com, et non contact@/);
  assert.match(senderRefusal("contact@5sursync.com", "ydiop@5sursync.com", box)!, /expéditeur réel \(sender\).*ydiop@/);
  assert.equal(parseAllowlist(" * "), "*");
  assert.deepEqual(parseAllowlist("Test@X.sn, autre@y.sn"), ["test@x.sn", "autre@y.sn"]);
});

test("linking: one exact contact only, duplicates and ambiguity left to a person", () => {
  const mb = "contact@5sursync.com";
  assert.deepEqual(counterpartAddresses({ folder: "inbox", from: "DG@Client.sn", to: [mb], cc: [] }, mb), ["dg@client.sn"]);
  assert.deepEqual(counterpartAddresses({ folder: "sentitems", from: mb, to: ["a@c.sn", mb], cc: ["b@c.sn"] }, mb), ["a@c.sn", "b@c.sn"]);
  assert.deepEqual(decideLink([{ id: 4, clientId: 9 }], []), { state: "linked", clientId: 9, contactId: 4 });
  assert.deepEqual(decideLink([{ id: 4, clientId: 9 }, { id: 4, clientId: 9 }], []), { state: "linked", clientId: 9, contactId: 4 });
  // The contact's own company address does not make it ambiguous.
  assert.deepEqual(decideLink([{ id: 4, clientId: 9 }], [9]), { state: "linked", clientId: 9, contactId: 4 });
  // Duplicate contacts, even in one company: manual.
  assert.deepEqual(decideLink([{ id: 4, clientId: 9 }, { id: 5, clientId: 9 }], []), { state: "ambiguous", clientIds: [9] });
  assert.deepEqual(decideLink([{ id: 4, clientId: 9 }, { id: 7, clientId: 2 }], []), { state: "ambiguous", clientIds: [9, 2] });
  // A contact plus another company's general address: manual.
  assert.deepEqual(decideLink([{ id: 4, clientId: 9 }], [3]), { state: "ambiguous", clientIds: [9, 3] });
  // A company's general address alone: manual, company proposed.
  assert.deepEqual(decideLink([], [3]), { state: "ambiguous", clientIds: [3] });
  assert.deepEqual(decideLink([], []), { state: "unknown" });
  assert.equal(companyDomain("x@sonatel.sn"), "sonatel.sn");
  assert.equal(companyDomain("x@gmail.com"), null);
  assert.equal(companyDomain("x@orange.sn"), null);
});

test("non-delivery reports: detection and failed recipients among our own", () => {
  assert.ok(isLikelyNdr("postmaster@5sursync.onmicrosoft.com", "x"));
  assert.ok(isLikelyNdr("MicrosoftExchange329e71ec88ae4615bbc36ab6ce41109e@5sursync.com", "x"));
  assert.ok(isLikelyNdr("someone@x.sn", "Non remis : Proposition"));
  assert.ok(isLikelyNdr("a@b.sn", "Undeliverable: Offre"));
  assert.ok(!isLikelyNdr("client@x.sn", "Re: Offre"));
  assert.ok(isNdrClass("REPORT.IPM.Note.NDR"));
  assert.ok(!isNdrClass("IPM.Note"));
  const report = "Le message n'a pas pu être remis à : prospect@exemple.sn\nRemote server returned '550 5.1.1 <prospect@exemple.sn>' ; copie : autre@inconnu.sn";
  assert.deepEqual(ndrFailedRecipients(report, ["Prospect@exemple.sn", "client@ok.sn"]), ["prospect@exemple.sn"]);
});

test("body: signature exactly once, text recovered, reply quote without active content", () => {
  const html = composeBody("Bonjour,\n<b>pas du HTML</b> & co");
  assert.equal(html.split(SIGNATURE_MARK).length - 1, 2); // id + class of the single table
  assert.ok(html.includes("&lt;b&gt;pas du HTML&lt;/b&gt; &amp; co") && html.includes("Bonjour,<br>"));
  assert.ok(signatureHtml().includes("Des solutions informatiques pour faire avancer votre entreprise."));
  assert.ok(signatureHtml().includes("WhatsApp +221 76 881 30 39") && signatureHtml().includes('src="cid:sync5-logo"'));
  // Logo to the right of the text: second cell of the same row.
  assert.ok(/<td [^>]*>[\s\S]*L’équipe 5\/Sync IT[\s\S]*<\/td><td[^>]*><img/.test(signatureHtml()));
  const quote = quoteHtml({ fromName: "Awa", fromAddress: "awa@x.sn", date: "2026-10-08T10:00:00Z", html: `<html><body><p>Question</p><script>alert(1)</script><img src="https://track.example/p.gif" onerror="x()"></body></html>` });
  assert.ok(!/script|onerror/i.test(quote) && quote.includes("Question") && quote.includes("awa@x.sn"));
  // A quoted previous message carrying our signature does not add one to our part.
  const reply = composeBody("Merci", quoteHtml({ html: signatureHtml() }));
  assert.ok(reply.indexOf("Merci") < reply.indexOf("sync5-quote"));
  assert.ok(hasSignature(reply));
  assert.equal(composeFromText("Bonjour,\nVoici l'offre.\n\nL’équipe 5/Sync IT\nDes solutions…"), "Bonjour,\nVoici l'offre.");
  assert.equal(composeFromText("texte sans signature"), null);
});

test("received HTML: active content removed", () => {
  const out = stripActiveHtml(`<p onclick="x()">a</p><script>s()</script><iframe src="https://x"></iframe><a href="javascript:alert(1)">l</a><meta http-equiv="refresh" content="0;url=https://x"><form action="https://x"><input></form><style>@import url(https://x/a.css); p{background:url(https://x/t.png)}</style><img src="data:image/png;base64,AA">`);
  assert.ok(!/onclick|<script|<iframe|javascript:|<meta|<form|<input|@import|https:\/\/x\/t\.png/i.test(out), out);
  assert.ok(out.includes("<p>a</p>") && out.includes("<a>l</a>"));
});

test("certificate assertion: RS256, x5t, audience of the tenant, verifiable", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const cred = { name: "read" as const, clientId: "11111111-2222-3333-4444-555555555555", keyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), thumbprint: "dGh1bWI", notAfter: new Date() };
  const jwt = clientAssertion({ tenantId: "17ea5f54-f67a-4949-b5b9-92a78a9d4fe7", loginBase: "https://login.microsoftonline.com" }, cred, Date.UTC(2026, 9, 8));
  const [h, p, s] = jwt.split(".");
  const head = JSON.parse(Buffer.from(h, "base64url").toString()), body = JSON.parse(Buffer.from(p, "base64url").toString());
  assert.deepEqual(head, { alg: "RS256", typ: "JWT", x5t: "dGh1bWI" });
  assert.equal(body.aud, "https://login.microsoftonline.com/17ea5f54-f67a-4949-b5b9-92a78a9d4fe7/oauth2/v2.0/token");
  assert.equal(body.iss, cred.clientId);
  assert.equal(body.exp - body.nbf, 600);
  assert.ok(createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, Buffer.from(s, "base64url")));
});

test("activation: real Microsoft only from production, fake Graph never from production", () => {
  const saved = { ...process.env };
  try {
    delete process.env.MAIL_ENABLED;
    assert.deepEqual(mailStatus(), { enabled: false, reason: "disabled" });
    process.env.MAIL_ENABLED = "true";
    process.env.APP_ORIGIN = "https://preprod.5sursync.com";
    delete process.env.MAIL_GRAPH_BASE; delete process.env.MAIL_LOGIN_BASE;
    assert.deepEqual(mailStatus(), { enabled: false, reason: "origin" });
    process.env.APP_ORIGIN = "https://5sursync.com";
    process.env.MAIL_GRAPH_BASE = "http://fakegraph:8080/v1.0";
    assert.deepEqual(mailStatus(), { enabled: false, reason: "origin" });
    delete process.env.MAIL_GRAPH_BASE;
    process.env.MAIL_READ_KEY_FILE = "/nonexistent";
    assert.deepEqual(mailStatus(), { enabled: false, reason: "configuration" });
  } finally {
    process.env = saved;
  }
});

test("synchronisation start and certificate thresholds", () => {
  const path = initialDeltaPath("/users/abc", "inbox", new Date("2026-07-10T08:00:00.123Z"));
  assert.equal(path, "/users/abc/mailFolders/inbox/messages/delta?%24select=id%2CinternetMessageId%2CconversationId%2Csubject%2Cfrom%2CtoRecipients%2CccRecipients%2CreceivedDateTime%2CsentDateTime%2ChasAttachments%2CisDraft&%24filter=receivedDateTime%20ge%202026-07-10T08%3A00%3A00Z");
  const now = Date.UTC(2026, 9, 8);
  const inDays = (d: number) => new Date(now + d * 86_400_000 + 3_600_000);
  assert.equal(certThreshold(inDays(40), now), null);
  assert.equal(certThreshold(inDays(30), now), 30);
  assert.equal(certThreshold(inDays(10), now), 14);
  assert.equal(certThreshold(inDays(6), now), 7);
  assert.equal(certThreshold(inDays(1), now), 1);
  assert.equal(certThreshold(new Date(now - 86_400_000), now), 0);
});

// ---------- Simafri (SMTP / IMAP) ----------
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Pool } from "pg";
import { SIMAFRI } from "../src/lib/mail/config";
import { smtpPhaseCode, smtpSendOutcome } from "../src/lib/mail/imap";
import { attachmentRefusal, buildMime, parseMail, withDate } from "../src/lib/mail/mime";
import { composeText, ndrKind, parseDsn, ndrKindFromText, statesFor } from "../src/lib/mail/rules";
import { mailDeps } from "../src/lib/mail/service";

test("Simafri activation: one provider only, real servers only from production, strict TLS", () => {
  const saved = { ...process.env };
  const dir = mkdtempSync(path.join(tmpdir(), "mail-"));
  const secretFile = path.join(dir, "pw");
  writeFileSync(secretFile, "fixture-secret\n", { mode: 0o600 });
  try {
    for (const k of Object.keys(process.env)) if (k.startsWith("MAIL_")) delete process.env[k];
    Object.assign(process.env, { MAIL_ENABLED: "true", MAIL_PROVIDER: "imap", APP_ORIGIN: "https://5sursync.com", MAIL_PASSWORD_FILE: secretFile });
    const prod = mailStatus();
    assert.ok(prod.enabled && prod.provider === "imap");
    if (prod.enabled && prod.provider === "imap") {
      assert.deepEqual([prod.config.smtp, prod.config.imap, prod.config.mailboxAddress, prod.config.user, prod.config.ca],
        [{ host: "mail.crm.5sursync.com", port: 587 }, { host: "da-uk2.hostns.io", port: 993 }, SIMAFRI.address, SIMAFRI.address, undefined]);
      assert.equal(prod.config.displayName, "L’équipe 5/Sync IT");
      assert.equal(prod.config.ehloName, "vmi3557177.contaboserver.net");
      assert.equal(prod.config.password(), "fixture-secret");
      assert.ok(!JSON.stringify(prod.config).includes("fixture-secret"), "password never serialised");
      assert.equal(prod.config.sendAllowlist, undefined, "sending closed until an acceptance list is set");
    }
    // Only the configured provider exists: no Graph client, so no Graph send possible.
    const deps = mailDeps({} as Pool);
    assert.ok(deps && "kind" in deps && deps.kind === "imap" && !("graph" in deps));
    // Preproduction can never reach the real mailbox.
    process.env.APP_ORIGIN = "https://preprod.5sursync.com";
    assert.deepEqual(mailStatus(), { enabled: false, reason: "origin" });
    // A test server never from production; a test authority never in production.
    process.env.APP_ORIGIN = "https://5sursync.com";
    Object.assign(process.env, { MAIL_SMTP_HOST: "smtp.test", MAIL_IMAP_HOST: "imap.test" });
    assert.deepEqual(mailStatus(), { enabled: false, reason: "origin" });
    delete process.env.MAIL_SMTP_HOST; delete process.env.MAIL_IMAP_HOST;
    process.env.MAIL_TLS_CA_FILE = secretFile;
    assert.deepEqual(mailStatus(), { enabled: false, reason: "configuration" });
    delete process.env.MAIL_TLS_CA_FILE;
    // In production, the IMAP host is da-uk2.hostns.io (mail.crm.5sursync.com fails TLS on IMAP).
    process.env.MAIL_IMAP_HOST = "mail.crm.5sursync.com";
    assert.deepEqual(mailStatus(), { enabled: false, reason: "configuration" });
    delete process.env.MAIL_IMAP_HOST;
    process.env.MAIL_ADDRESS = "autre@crm.5sursync.com";
    assert.deepEqual(mailStatus(), { enabled: false, reason: "configuration" });
    delete process.env.MAIL_ADDRESS;
    process.env.MAIL_PASSWORD_FILE = path.join(dir, "absent");
    assert.deepEqual(mailStatus(), { enabled: false, reason: "configuration" });
    process.env.MAIL_PROVIDER = "les-deux";
    assert.deepEqual(mailStatus(), { enabled: false, reason: "configuration" });
  } finally {
    process.env = saved;
  }
});

test("delivery reports: unknown address vs transport block", () => {
  assert.equal(ndrKind("5.1.1"), "address");
  assert.equal(ndrKind("5.1.10"), "address");
  assert.equal(ndrKind("5.2.1"), "address");
  assert.equal(ndrKind("5.7.708"), "transport");
  assert.equal(ndrKind("5.7.1"), "transport");
  assert.equal(ndrKind("5.4.1"), "transport");
  assert.equal(ndrKind("5.2.2"), "transport");
  assert.equal(ndrKind("4.4.7"), "temporary");
  assert.equal(ndrKind(null, "550 5.7.708 Service unavailable. Access denied, traffic not accepted from this IP."), "transport");
  assert.equal(ndrKind(""), "unknown");
  assert.equal(ndrKindFromText("Remote server returned '550 5.1.1 RESOLVER.ADR.RecipNotFound; not found'"), "address");
  const dsn = parseDsn("Reporting-MTA: dns; mx.example\r\n\r\nFinal-Recipient: rfc822; <A@X.example>\r\nAction: failed\r\nStatus: 5.1.1\r\nDiagnostic-Code: smtp; 550 5.1.1 User\r\n unknown\r\n\r\nFinal-Recipient: rfc822;b@x.example\r\nAction: delayed\r\nStatus: 4.4.1\r\n\r\nFinal-Recipient: rfc822;c@x.example\r\nAction: delivered\r\nStatus: 2.0.0\r\n");
  assert.deepEqual(dsn.map((r) => [r.address, r.kind]), [["a@x.example", "address"], ["b@x.example", "temporary"]]);
  assert.equal(dsn[0].diagnostic, "550 5.1.1 User unknown");
});

test("SMTP outcome: a server reply proves refusal, silence proves nothing", () => {
  assert.deepEqual(smtpSendOutcome({ code: "EENVELOPE", responseCode: 550, command: "RCPT TO" }), { state: "failed", code: "smtp-550-rcpt" });
  assert.deepEqual(smtpSendOutcome({ code: "EMESSAGE", responseCode: 451, command: "DATA" }), { state: "failed", code: "smtp-451-data" });
  assert.deepEqual(smtpSendOutcome({ code: "ETIMEDOUT", command: "CONN" }), { state: "uncertain", code: "smtp-etimedout" });
  assert.deepEqual(smtpSendOutcome({ code: "ECONNECTION", command: "CONN" }), { state: "uncertain", code: "smtp-econnection" });
  assert.equal(smtpPhaseCode("connect", { code: "ESOCKET", message: "self-signed certificate in certificate chain" }), "smtp-tls");
  assert.equal(smtpPhaseCode("connect", { code: "ETLS", message: "Hostname/IP does not match certificate's altnames" }), "smtp-tls");
  assert.equal(smtpPhaseCode("connect", { code: "ECONNREFUSED", message: "connect ECONNREFUSED" }), "smtp-unreachable");
  // Seen in production on 09/10: EHLO name refused; not a TLS failure.
  assert.equal(smtpPhaseCode("connect", { code: "ECONNECTION", message: "EHLO failed but HELO does not support required STARTTLS. response=550 Bad HELO - Host impersonating domain name [crm.5sursync.com]" }), "smtp-connect-550");
  assert.equal(smtpPhaseCode("auth", { code: "EAUTH", responseCode: 535 }), "smtp-auth-535");
});

test("MIME: text and HTML, signature and logo once, thread headers, Date set at sending", async () => {
  const address = "contact@crm.5sursync.com";
  const raw = await buildMime({
    from: { name: "L’équipe 5/Sync IT", address }, to: ["a@x.sn"], cc: [], subject: "Objet é", messageId: "<m1@crm.5sursync.com>",
    text: composeText("Bonjour", address), html: composeBody("Bonjour", "", address), inReplyTo: "<o@x.sn>", references: ["<r@x.sn>", "<o@x.sn>"],
    attachments: [{ filename: "offre.pdf", contentType: "application/pdf", content: Buffer.from("%PDF") }], logo: Buffer.from([0xff, 0xd8, 0xff]),
  });
  const m = await parseMail(raw);
  assert.equal(m.messageId, "<m1@crm.5sursync.com>");
  assert.equal(m.inReplyTo, "<o@x.sn>");
  assert.deepEqual(m.references, ["<r@x.sn>", "<o@x.sn>"]);
  assert.deepEqual(m.from?.value.map((v) => [v.name, v.address]), [["L’équipe 5/Sync IT", address]]);
  assert.equal(m.replyTo?.value[0].address, address);
  assert.equal(String(m.html).split("sync5-signature").length - 1, 2);
  assert.equal(String(m.html).split("cid:sync5-logo").length - 1, 1);
  assert.ok(String(m.html).includes("mailto:contact@crm.5sursync.com") && !String(m.html).includes("contact@5sursync.com"));
  assert.equal(m.attachments.filter((a) => a.cid === "sync5-logo").length, 1);
  assert.equal((m.text ?? "").split("L’équipe 5/Sync IT").length - 1, 1);
  assert.equal(composeFromText(m.text ?? ""), "Bonjour");
  assert.ok(!/^Bcc:/im.test(raw.toString()) && !/X-Mailer/i.test(raw.toString()));
  const dated = withDate(raw, new Date(Date.UTC(2026, 9, 9, 12, 0, 0)));
  assert.match(dated.toString(), /^Date: Fri, 09 Oct 2026 12:00:00 \+0000\r$/m);
  assert.equal(dated.toString().split(/^Date:/m).length - 1, 1);
});

test("attachments and state labels", () => {
  assert.equal(attachmentRefusal([{ name: "offre.pdf", size: 1000 }]), null);
  assert.match(attachmentRefusal([{ name: "x.exe", size: 1 }])!, /refusé/);
  assert.match(attachmentRefusal([{ name: "page.html", size: 1 }])!, /refusé/);
  assert.match(attachmentRefusal([{ name: "a.pdf", size: 5 * 1024 * 1024 }])!, /4 Mo/);
  assert.match(attachmentRefusal(Array.from({ length: 6 }, (_, i) => ({ name: `${i}.pdf`, size: 1 })))!, /5 pièces/);
  assert.equal(statesFor("imap").accepted.label, "Accepté par le serveur SMTP");
  assert.equal(statesFor("imap").in_sent.label, "Accepté, copie dans Envoyés");
  assert.equal(statesFor("graph").accepted.label, "Accepté par Microsoft");
  assert.ok(signatureHtml().includes("contact@5sursync.com") && signatureHtml("contact@crm.5sursync.com").includes("contact@crm.5sursync.com"));
});
