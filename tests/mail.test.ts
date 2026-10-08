import { test } from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { canMail, mailLevel } from "../src/lib/mail/access";
import { mailStatus, parseAllowlist } from "../src/lib/mail/config";
import { clientAssertion } from "../src/lib/mail/graph";
import {
  companyDomain, composeBody, composeFromText, counterpartAddresses, decideLink, hasSignature, isLikelyNdr, isNdrClass,
  ndrFailedRecipients, parseRecipients, quoteHtml, sendRefusal, signatureHtml, stripActiveHtml, SIGNATURE_MARK,
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
