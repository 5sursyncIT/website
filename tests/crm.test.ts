import { test } from "node:test";
import assert from "node:assert/strict";
import { csv, csvCell, defaultProbability, isActiveProspect, isOpenStage, missingNextAction, money, prospectPriority, prospectStageLabel, prospectStageOf, safeBack, weighted, withMessage } from "../src/lib/crm";
import { priorityLabel, priorityRank, waitingState } from "../src/lib/support";
import { serviceLabel, serviceTopic, services, topics } from "../src/lib/contact-topics";
import { localePath } from "../src/lib/locale";
import { contactSchema } from "../src/lib/validation";
import { clientSchema } from "../src/lib/crm-schema";
// Minimal valid payload of the public contact form, reused by the service-context test.
const base = { name: "Visiteur", company: "Societe", email: "v@example.test", phone: "", message: "Dix caracteres au moins.", topic: "reseaux-cloud", website: "" };

test("CSV cells neutralise spreadsheet formulas and quote separators", () => {
  assert.equal(csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(csvCell("+221 77 000"), "'+221 77 000");
  assert.equal(csvCell("@cmd"), "'@cmd");
  assert.equal(csvCell("a;b"), "\"a;b\"");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(1500000), "1500000");
  assert.ok(csv([["a", "b"]]).startsWith("﻿a;b\r\n"));
});

test("pipeline weighting and stage defaults", () => {
  assert.equal(weighted([{ amount: 1000, probability: 50 }, { amount: 200, probability: null }, { amount: null, probability: 90 }]), 500);
  assert.equal(defaultProbability("proposal"), 50);
  assert.equal(defaultProbability("won"), 100);
  assert.equal(defaultProbability("unknown"), 10);
  assert.ok(isOpenStage("negotiation"));
  assert.ok(!isOpenStage("won"));
  assert.match(money(1250000), /^1\s?250\s?000 FCFA$/);
});

test("form redirects stay inside /crm", () => {
  assert.equal(safeBack("/crm/clients/12"), "/crm/clients/12");
  assert.equal(safeBack("/crm/taches?qui=moi&type=call"), "/crm/taches?qui=moi&type=call");
  for (const bad of ["https://evil.example/crm", "//evil.example", "/crm//evil", "/admin", "/crm/../admin", "/crmx", null, 42])
    assert.equal(safeBack(bad, "/crm"), "/crm", String(bad));
  assert.equal(withMessage("/crm/taches?qui=moi&ok=old", "erreur", "Échec"), "/crm/taches?qui=moi&erreur=%C3%89chec");
});

test("search normalisation ignores accents, case and spacing", async () => {
  const { normalizeSearch } = await import("../src/lib/crm");
  assert.equal(normalizeSearch("  Société  Générale ", null, "", "ÉCOLE"), "societe generale ecole");
  assert.equal(normalizeSearch("Ministère de la Santé"), "ministere de la sante");
});

test("document totals, numbering and status rules", async () => {
  const { documentTotals, nextDocumentNumber, documentEditable, documentTransitions } = await import("../src/lib/crm");
  assert.deepEqual(documentTotals([{ quantity: 3, unitPrice: 150000 }, { quantity: 0.5, unitPrice: 101 }], 18), { subtotal: 450051, vat: 81009, total: 531060 });
  assert.deepEqual(documentTotals([], 18), { subtotal: 0, vat: 0, total: 0 });
  assert.equal(nextDocumentNumber("invoice", 2026, null), "FAC-2026-0001");
  assert.equal(nextDocumentNumber("quote", 2026, "DEV-2026-0041"), "DEV-2026-0042");
  assert.ok(documentEditable("invoice", "draft") && !documentEditable("invoice", "issued"));
  assert.ok(documentEditable("quote", "sent") && !documentEditable("quote", "accepted"));
  assert.deepEqual(documentTransitions.invoice.cancelled, []);
  assert.ok(!documentTransitions.invoice.issued.includes("draft"));
});

test("reminders: production-only gate and honest delivery states", async () => {
  const { crmRemindersEnabled, deliverOne, reminderMail } = await import("../src/lib/crm-reminders");
  const on = { APP_ORIGIN: "https://5sursync.com", SMTP_ENABLED: "true", CRM_EMAIL_ENABLED: "true" };
  assert.ok(crmRemindersEnabled(on));
  for (const env of [{ ...on, APP_ORIGIN: "https://preprod.5sursync.com" }, { ...on, SMTP_ENABLED: "false" }, { ...on, CRM_EMAIL_ENABLED: undefined }])
    assert.ok(!crmRemindersEnabled(env));
  const task = { id: 7, subject: "Relancer le devis", kind: "task", client: "Société Fixture", dueAt: new Date("2026-10-08T09:30:00Z") };
  const job = { type: "reminder" as const, key: [7, task.dueAt] as [number, Date], claim: "c", messageID: "<m@5sursync.com>", recipient: "Equipe@Example.test", task };
  const mail = reminderMail(job);
  assert.match(mail.subject, /Rappel CRM : Relancer le devis/);
  assert.match(mail.text, /Société Fixture/);
  assert.equal(mail.from, "no-reply@5sursync.com");
  const finished: string[] = [];
  const repo = (j: typeof job | null) => ({
    claimReminder: async () => j, claimDigest: async () => null,
    finish: async (_: unknown, state: string) => { finished.push(state); },
  });
  assert.equal(await deliverOne(repo(null), async () => ({ accepted: [] })), false);
  await deliverOne(repo(job), async () => ({ accepted: ["equipe@example.test"] }));
  await deliverOne(repo(job), async () => ({ accepted: ["autre@example.test"] }));
  await deliverOne(repo(job), async () => { throw new Error("timeout"); });
  assert.deepEqual(finished, ["accepted", "failed", "uncertain"]);
});

test("VAT per line, deposits and invoice balance", async () => {
  const { documentTotals, vatBreakdown, depositLines, invoiceBalance } = await import("../src/lib/crm");
  const lines = [
    { quantity: 4, unitPrice: 150000, vatRate: 18 },
    { quantity: 1, unitPrice: 100000, vatRate: 0 },
    { quantity: 2, unitPrice: 15000, vatRate: 10 },
  ];
  assert.deepEqual(vatBreakdown(lines, 18), [{ rate: 18, base: 600000, vat: 108000 }, { rate: 10, base: 30000, vat: 3000 }, { rate: 0, base: 100000, vat: 0 }]);
  assert.deepEqual(documentTotals(lines, 18), { subtotal: 730000, vat: 111000, total: 841000 });
  // A line without its own rate uses the document's.
  assert.deepEqual(documentTotals([{ quantity: 1, unitPrice: 1000 }], 10), { subtotal: 1000, vat: 100, total: 1100 });
  // Deduction lines (negative) lower the base of their rate.
  assert.deepEqual(documentTotals([...lines.slice(0, 2), { quantity: 1, unitPrice: -180000, vatRate: 18 }], 18), { subtotal: 520000, vat: 75600, total: 595600 });
  const deposit = depositLines(lines.slice(0, 2), 30, "DEV-2026-0001");
  assert.deepEqual(deposit.map((l) => [l.unitPrice, l.vatRate]), [[180000, 18], [30000, 0]]);
  assert.match(deposit[0].description, /Acompte de 30 % sur le devis DEV-2026-0001 \(part à TVA 18 %\)/);
  assert.deepEqual(invoiceBalance(808000, [{ amount: 200000 }, { amount: 100000 }], 277000), { amountPaid: 300000, balance: 231000 });
});

test("server PDF: WinAnsi-safe text, valid multi-page document", async () => {
  const { pdfText, documentPDF } = await import("../src/lib/crm-pdf");
  const { PDFDocument } = await import("pdf-lib");
  assert.equal(pdfText("1 250 000 FCFA — été ✓"), "1 250 000 FCFA — été ?");
  const doc = {
    id: 1, kind: "invoice", invoiceType: "deposit", status: "issued", number: "FAC-2026-0007", title: "Acompte — réseau du siège",
    client: { id: 2, name: "Société Fixture", address: "Rue 10", city: "Dakar", country: "Sénégal", registration: "SN-FIXTURE" },
    issueDate: "2026-10-08T00:00:00.000Z", dueDate: "2026-11-07T00:00:00.000Z", vatRate: 18,
    lines: Array.from({ length: 45 }, (_, n) => ({ description: `Ligne ${n + 1} : désignation assez longue pour passer sur deux lignes dans la colonne du tableau`, quantity: 1, unitPrice: 1000, vatRate: n % 2 ? 0 : 18 })),
    subtotal: 45000, vat: 4140, total: 49140, amountPaid: 10000, balance: 39140, conditions: "Paiement à 30 jours.\nPénalités selon la loi.",
    createdAt: "2026-10-08T00:00:00.000Z", updatedAt: "2026-10-08T00:00:00.000Z",
  } as unknown as Parameters<typeof documentPDF>[0];
  const bytes = await documentPDF(doc, { address: "Almadie 2, Sénégal", phones: [{ display: "+221 77 097 29 08" }], email: "contact@5sursync.com" });
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
  const parsed = await PDFDocument.load(bytes);
  assert.ok(parsed.getPageCount() >= 2, `pages: ${parsed.getPageCount()}`);
  assert.match(parsed.getTitle() ?? "", /FACTURE D’ACOMPTE FAC-2026-0007/);
});

test("document mail ledger records what SMTP answered", async () => {
  const { sendDocumentMail } = await import("../src/lib/crm-document-mail");
  const queries: unknown[][] = [];
  const pool = { query: async (text: string, values: unknown[]) => (queries.push([text, values]), { rows: [{ id: 9 }] }) } as never;
  const input = { documentID: 3, to: "Client@Example.test", subject: "Facture", text: "Bonjour", pdf: new Uint8Array([37, 80, 68, 70]), filename: "FAC-2026-0001.pdf", replyTo: "equipe@example.test", sentBy: 1 };
  let mail: { attachments: { content: Buffer; filename: string }[]; bcc?: string; from: string } | undefined;
  assert.equal(await sendDocumentMail(pool, input, async (m) => ((mail = m), { accepted: ["client@example.test"] })), "accepted");
  assert.equal(mail!.from, "no-reply@5sursync.com");
  assert.equal(mail!.bcc, "equipe@example.test");
  assert.equal(mail!.attachments[0].filename, "FAC-2026-0001.pdf");
  assert.equal(mail!.attachments[0].content.subarray(0, 4).toString(), "%PDF");
  assert.equal(await sendDocumentMail(pool, input, async () => ({ accepted: [] })), "failed");
  assert.equal(await sendDocumentMail(pool, input, async () => { throw new Error("reset"); }), "uncertain");
  const states = queries.filter(([t]) => String(t).startsWith("UPDATE")).map(([, v]) => (v as unknown[])[1]);
  assert.deepEqual(states, ["accepted", "failed", "uncertain"]);
  assert.ok(queries.filter(([t]) => String(t).startsWith("INSERT")).every(([, v]) => (v as unknown[])[4] !== undefined));
});

test("nodemailer 10 delivers a PDF attachment over SMTP (local sink, nothing leaves)", async () => {
  const net = await import("node:net");
  const { createRequire } = await import("node:module");
  const nodemailer = createRequire(import.meta.url)("nodemailer");
  let data = "";
  const server = net.createServer((socket) => {
    let inData = false, buffer = "";
    socket.write("220 sink ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("latin1");
      let i;
      while ((i = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        if (inData) {
          if (line === ".") { inData = false; socket.write("250 queued\r\n"); } else data += line + "\n";
        } else if (/^EHLO/i.test(line)) socket.write("250-sink\r\n250 8BITMIME\r\n");
        else if (/^DATA/i.test(line)) { inData = true; socket.write("354 go\r\n"); }
        else if (/^QUIT/i.test(line)) { socket.write("221 bye\r\n"); socket.end(); }
        else socket.write("250 ok\r\n");
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as { port: number }).port;
  const transport = nodemailer.createTransport({ host: "127.0.0.1", port, secure: false, ignoreTLS: true });
  const info = await transport.sendMail({
    from: "no-reply@5sursync.com", to: "client@example.test", bcc: "equipe@example.test", subject: "Facture FAC-2026-0001",
    text: "Bonjour", attachments: [{ filename: "FAC-2026-0001.pdf", content: Buffer.from("%PDF-1.7 fixture"), contentType: "application/pdf" }],
  });
  transport.close();
  server.close();
  assert.deepEqual(info.accepted.sort(), ["client@example.test", "equipe@example.test"]);
  assert.match(data, /Content-Type: application\/pdf; name=FAC-2026-0001\.pdf/);
  assert.ok(!/^Bcc:/m.test(data), "Bcc header must not be transmitted");
});

test("media file names: accents allowed, paths refused", async () => {
  const { isMediaFilename } = await import("../src/lib/showcase");
  for (const ok of ["Douanes_sénégalaises.jpg", "logo-ina.png", "Logo client 2026.webp", "Société.png".normalize("NFD")])
    assert.ok(isMediaFilename(ok), ok);
  for (const bad of ["../secret.png", "a/b.png", "a\\b.png", ".env", "x..png", "", "a".repeat(201), "logo%2F.png", "nul\0.png"])
    assert.ok(!isMediaFilename(bad), JSON.stringify(bad));
});

test("flash messages keep the anchor after the query string", () => {
  assert.equal(withMessage("/crm/clients/7#suivi", "ok", "Fait"), "/crm/clients/7?ok=Fait#suivi");
  assert.equal(withMessage("/crm/clients/7?etape=lost#suivi", "ok", "Raison"), "/crm/clients/7?etape=lost&ok=Raison#suivi");
});

test("commercial follow-up stages", () => {
  // A company created before the follow-up (no stage stored) is « À contacter ».
  assert.equal(prospectStageOf(null), "to-contact");
  assert.equal(prospectStageOf("bogus"), "to-contact");
  assert.equal(prospectStageLabel("on-hold"), "En attente (budget)");
  for (const stage of ["to-contact", "contacted", "engaged", "need", "meeting", "quote", "on-hold", null])
    assert.ok(isActiveProspect(stage), String(stage));
  assert.ok(!isActiveProspect("won") && !isActiveProspect("lost"));
  // The most advanced conversations are planned first.
  const order = ["to-contact", "contacted", "on-hold", "engaged", "need", "meeting", "quote"].sort((a, b) => prospectPriority(a) - prospectPriority(b));
  assert.deepEqual(order, ["quote", "meeting", "need", "engaged", "on-hold", "contacted", "to-contact"]);
});
test("ticket urgency and who owes an answer are read from the replies", () => {
  // Triage order: urgent first, unknown value treated as normal (never as most urgent).
  const order = ["normal", "urgent", "low", "high"].sort((a, b) => priorityRank(a) - priorityRank(b));
  assert.deepEqual(order, ["urgent", "high", "normal", "low"]);
  assert.equal(priorityRank("bogus"), priorityRank("normal"));
  assert.equal(priorityLabel("urgent"), "Urgente");
  assert.equal(priorityLabel(null), "Normale");
  const ticket = { id: 7, createdAt: "2026-10-01T08:00:00.000Z" };
  const team = (at: string) => ({ ticket: 7, author: { relationTo: "admins" }, createdAt: at });
  const client = (at: string) => ({ ticket: 7, author: { relationTo: "client-accounts" }, createdAt: at });
  // No reply at all: waiting since the ticket was opened, not since updatedAt.
  let state = waitingState(ticket, []);
  assert.equal(state.awaiting, true);
  assert.equal(state.since, "2026-10-01T08:00:00.000Z");
  assert.equal(state.team, null);
  // The team answered last: nothing is owed.
  state = waitingState(ticket, [client("2026-10-02T08:00:00.000Z"), team("2026-10-03T08:00:00.000Z")]);
  assert.equal(state.awaiting, false);
  assert.equal(state.since, "2026-10-03T08:00:00.000Z");
  // The client spoke last: the team owes an answer since that message.
  state = waitingState(ticket, [team("2026-10-03T08:00:00.000Z"), client("2026-10-04T09:30:00.000Z")]);
  assert.equal(state.awaiting, true);
  assert.equal(state.since, "2026-10-04T09:30:00.000Z");
  // Replies of another ticket never count.
  state = waitingState(ticket, [{ ticket: 99, author: { relationTo: "admins" }, createdAt: "2026-10-05T08:00:00.000Z" }]);
  assert.equal(state.awaiting, true);
  assert.equal(state.team, null);
});
test("next action rule: an alert everywhere, never a refusal", () => {
  // The rule the pages, the board, the save message and the import all share.
  assert.ok(missingNextAction("meeting", 0));
  assert.ok(!missingNextAction("meeting", 1));
  // A closed company owes nothing.
  assert.ok(!missingNextAction("won", 0));
  assert.ok(!missingNextAction("lost", 0));
  // A company with no stage stored counts as active ("À contacter").
  assert.ok(missingNextAction(null, 0));
});
test("service context of the contact form stays bounded", () => {
  assert.equal(serviceTopic("reseaux-cloud"), "reseaux-cloud");
  assert.equal(serviceLabel("solutions-metier"), "Solutions métier");
  // An invented page is not a service: no label, no preselected need.
  assert.equal(serviceTopic("page-inventee"), "");
  assert.equal(serviceLabel("page-inventee"), "");
  assert.equal(serviceTopic(null), "");
  // Every service maps to a real need of the contact form.
  for (const [slug] of services) assert.ok(topics.some(([t]) => t === serviceTopic(slug)), slug);
  // The schema accepts a known service, an empty one, and refuses anything else.
  assert.equal(contactSchema.safeParse({ ...base, service: "reseaux-cloud" }).success, true);
  assert.equal(contactSchema.safeParse({ ...base, service: "" }).success, true);
  assert.equal(contactSchema.safeParse({ ...base }).success, true);
  assert.equal(contactSchema.safeParse({ ...base, service: "page-inventee" }).success, false);
  assert.equal(contactSchema.safeParse({ ...base, service: "<script>" }).success, false);
});
test("localised links keep their query string", () => {
  // /contact?service=… must reach the English contact page, not the French one.
  assert.equal(localePath("en", "/contact?service=reseaux-cloud"), "/en/contact?service=reseaux-cloud");
  assert.equal(localePath("en", "/realisations#groupe-hage"), "/en/projects#groupe-hage");
  assert.equal(localePath("en", "/contact"), "/en/contact");
  assert.equal(localePath("fr", "/contact?service=reseaux-cloud"), "/contact?service=reseaux-cloud");
});
test("service case studies point at real published projects", async () => {
  // Every anchor chosen for a service page must exist in the shipped case studies,
  // otherwise the page would link to /realisations#nothing.
  const { caseStudySeeds, serviceCaseAnchors } = await import("../src/lib/showcase");
  const historical = (await import("../src/content/historical-cases.json", { with: { type: "json" } })).default as { anchor: string }[];
  const known = new Set([...caseStudySeeds.map((c) => c.anchor), ...historical.map((c) => c.anchor)]);
  for (const [service, anchors] of Object.entries(serviceCaseAnchors)) {
    assert.ok(anchors.length >= 2, `${service}: ${anchors.length} réalisation(s)`);
    for (const anchor of anchors) assert.ok(known.has(anchor), `${service} → ${anchor}`);
  }
});
test("besoins d'une entreprise : vocabulaire partagé et valeurs bornées", () => {
  // Les besoins d'une fiche, le sujet du formulaire public et la catégorie d'un ticket
  // utilisent la même liste : une demande convertie se range sans traduction.
  const champs = { name: "Société", stage: "prospect" as const, source: "", sector: "", registration: "",
    email: "", phone: "", website: "", address: "", city: "", country: "", notes: "", needsDetail: "" };
  const ok = clientSchema.safeParse({ ...champs, needs: ["reseaux-cloud", "maintenance-support"] });
  assert.equal(ok.success, true);
  assert.deepEqual(ok.success && ok.data.needs, ["reseaux-cloud", "maintenance-support"]);
  // Aucun besoin : tableau vide, jamais undefined, pour que la fiche sache quoi afficher.
  const vide = clientSchema.safeParse(champs);
  assert.equal(vide.success && Array.isArray(vide.data.needs) && vide.data.needs.length, 0);
  // Un besoin inventé est refusé : la liste reste celle des services réellement proposés.
  assert.equal(clientSchema.safeParse({ ...champs, needs: ["besoin-invente"] }).success, false);
  // Chaque besoin possible correspond à un sujet du formulaire public.
  for (const [sujet] of topics)
    assert.equal(clientSchema.safeParse({ ...champs, needs: [sujet] }).success, true, sujet);
});
test("les besoins ne s'importent pas depuis un fichier CSV", async () => {
  // Ils se renseignent au fil des échanges et à la conversion d'une demande, jamais
  // par une colonne de tableur : une réimportation ne doit pas les écraser.
  const { fieldLabels } = await import("../src/lib/crm-import");
  assert.ok(!("needs" in fieldLabels) && !("needsDetail" in fieldLabels));
  assert.ok("name" in fieldLabels && "notes" in fieldLabels);
});
