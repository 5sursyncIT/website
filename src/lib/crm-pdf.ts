import { readFile } from "node:fs/promises";
import path from "node:path";
import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { CrmDocument } from "@/payload-types";
import { documentKindLabel, invoiceCredited, lineTotal, money, vatBreakdown } from "./crm";
import { LEGAL } from "./legal";
// Server-side A4 PDF of a quote, invoice or credit note (attached to e-mails and
// downloadable). Standard fonts only: text is reduced to the WinAnsi character set.
export type Company = { address: string; phones: { display: string }[]; email: string };
const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
export function pdfText(value: unknown) {
  return String(value ?? "")
    .replace(/[   ]/g, " ")
    .replace(/[‐‑]/g, "-")
    .replace(/\r/g, "")
    .replace(/[^\n\x20-\x7e\xa0-\xff]/g, (c) => (WIN_ANSI_EXTRA.includes(c) ? c : "?"));
}
const day = (v: unknown) =>
  v ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Dakar" }).format(new Date(String(v))) : "—";
// Site palette (src/app/(site)/globals.css).
const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const ink = hex("#080d24"), navy = hex("#092234"), aqua = hex("#2ee9d8"), teal = hex("#00b9b4"), tealInk = hex("#007a77");
const muted = hex("#4a6482"), body = hex("#344d6c"), line = hex("#d5e0ea"), lineStrong = hex("#b9c9da"), pale = hex("#eaf7fc");
const numberGrey = hex("#a5acb6"), white = rgb(1, 1, 1), bad = hex("#b42318");
const A4 = [595.28, 841.89] as const, M = 48;
function wrap(text: string, font: PDFFont, size: number, width: number) {
  const out: string[] = [];
  for (const paragraph of pdfText(text).split("\n")) {
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) current = next;
      else {
        if (current) out.push(current);
        // A single word wider than the column is cut.
        let w = word;
        while (font.widthOfTextAtSize(w, size) > width && w.length > 1) {
          let n = w.length;
          while (n > 1 && font.widthOfTextAtSize(w.slice(0, n), size) > width) n--;
          out.push(w.slice(0, n));
          w = w.slice(n);
        }
        current = w;
      }
    }
    out.push(current);
  }
  return out;
}
export async function documentPDF(doc: CrmDocument, company: Company, creditFor?: string | null): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(await readFile(path.resolve("public/assets/logo-horizontal-transparent.png")));
  const kindLabel = doc.kind === "credit" ? "Avoir" : documentKindLabel(doc.kind, doc.invoiceType);
  const title = kindLabel.toUpperCase();
  pdf.setTitle(pdfText(`${title} ${doc.number ?? "brouillon"} — 5/Sync IT`));
  pdf.setAuthor("5/Sync IT");
  pdf.setCreator("CRM 5/Sync IT");
  const client = typeof doc.client === "object" ? doc.client : null;
  const contact = doc.contact && typeof doc.contact === "object" ? doc.contact : null;
  const isInvoice = doc.kind === "invoice";
  const W = A4[0] - 2 * M, TOP = A4[1] - 40, BOTTOM = M + 30;
  let page: PDFPage = pdf.addPage([...A4]);
  let y = TOP;
  const text = (t: unknown, x: number, yy: number, size = 9.5, font = regular, color = body) =>
    page.drawText(pdfText(t), { x, y: yy, size, font, color });
  const right = (t: unknown, xr: number, yy: number, size = 9.5, font = regular, color = body) =>
    text(t, xr - font.widthOfTextAtSize(pdfText(t), size), yy, size, font, color);
  // Letter-spaced capitals, like the site's eyebrows and labels.
  const spacedWidth = (t: string, size: number, font: PDFFont, sp: number) =>
    [...pdfText(t)].reduce((w, c) => w + font.widthOfTextAtSize(c, size) + sp, -sp);
  const spaced = (t: string, x: number, yy: number, size: number, font: PDFFont, color: ReturnType<typeof rgb>, sp: number) => {
    for (const c of pdfText(t)) (page.drawText(c, { x, y: yy, size, font, color }), (x += font.widthOfTextAtSize(c, size) + sp));
  };
  const label = (t: string, x: number, yy: number, color = muted) => spaced(t.toUpperCase(), x, yy, 6.8, bold, color, 1);
  const rect = (x: number, yy: number, width: number, height: number, color: ReturnType<typeof rgb>) =>
    page.drawRectangle({ x, y: yy, width, height, color });

  // Header: logo on the left; eyebrow, number and short aqua rule on the right.
  const lw = 160, lh = (logo.height / logo.width) * lw;
  page.drawImage(logo, { x: M, y: y - lh - 2, width: lw, height: lh });
  const ew = spacedWidth(title, 8, bold, 1.6);
  rect(A4[0] - M - ew - 13, y - 9, 7, 7, aqua);
  spaced(title, A4[0] - M - ew, y - 8.5, 8, bold, ink, 1.6);
  right(doc.number ?? "Brouillon", A4[0] - M, y - 33, 22, bold, navy);
  rect(A4[0] - M - 32, y - 47, 32, 2.5, aqua);
  let hy = y - 47;
  const status = doc.status === "cancelled" ? "ANNULÉE" : isInvoice && doc.status === "paid" ? `SOLDÉE LE ${day(doc.paidAt).toUpperCase()}` : "";
  if (status) {
    const sw = spacedWidth(status, 7.5, bold, 1);
    spaced(status, A4[0] - M - sw, y - 62, 7.5, bold, doc.status === "cancelled" ? bad : tealInk, 1);
    hy = y - 62;
  }
  y = Math.min(y - lh - 2, hy) - 18;

  // Dates and amount band (pale, like the site's light sections).
  const showBalance = isInvoice && doc.status !== "cancelled" && doc.balance != null;
  const meta: [string, string][] = [["Date", day(doc.issueDate ?? doc.createdAt)]];
  if (isInvoice) meta.push(["Échéance", day(doc.dueDate)]);
  if (doc.kind === "quote") meta.push(["Valable jusqu’au", day(doc.validUntil)]);
  if (creditFor) meta.push(["Facture d’origine", creditFor]);
  meta.push([showBalance && doc.balance !== doc.total ? "Reste à payer" : "Montant TTC", money(showBalance ? doc.balance : doc.total)]);
  const bandH = 40, cw = W / meta.length;
  rect(M, y - bandH, W, bandH, pale);
  meta.forEach(([k, v], i) => {
    const x = M + i * cw + 12, last = i === meta.length - 1;
    if (i) page.drawLine({ start: { x: M + i * cw, y: y - bandH }, end: { x: M + i * cw, y }, thickness: 1, color: white });
    label(k, x, y - 14);
    text(v, x, y - 29, last ? 11 : 9.5, bold, last ? navy : ink);
  });
  y -= bandH + 22;

  // Issuer and client, two columns; the client column carries the teal edge.
  const half = W / 2, colW = half - 28;
  const issuer = [LEGAL.seat(company.address), company.phones.map((p) => p.display).join(" · "), company.email].flatMap((l) => wrap(l, regular, 8.8, colW));
  const clientLines = [
    contact ? `À l’attention de ${contact.name}${contact.jobTitle ? `, ${contact.jobTitle}` : ""}` : "",
    client?.address ?? "",
    [client?.city, client?.country].filter(Boolean).join(", "),
    client?.registration ? `NINEA / RCCM : ${client.registration}` : "",
  ].filter(Boolean).flatMap((l) => wrap(l, regular, 8.8, colW - 6));
  const clientName = wrap(client?.name ?? "", bold, 10.5, colW - 6);
  const partyH = Math.max(30 + issuer.length * 12, 16 + clientName.length * 13 + clientLines.length * 12);
  label("Émetteur", M, y);
  text(LEGAL.name, M, y - 16, 10.5, bold, ink);
  issuer.forEach((l, i) => text(l, M, y - 30 - i * 12, 8.8));
  const cx = M + half + 16;
  rect(M + half, y - partyH + 6, 2.5, partyH + 4, teal);
  label(doc.kind === "quote" ? "Destinataire" : "Facturé à", cx, y);
  clientName.forEach((l, i) => text(l, cx, y - 16 - i * 13, 10.5, bold, ink));
  clientLines.forEach((l, i) => text(l, cx, y - 16 - clientName.length * 13 - 1 - i * 12, 8.8));
  y -= partyH + 14;

  // Subject.
  page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.8, color: lineStrong });
  y -= 16;
  label("Objet", M, y);
  y -= 17;
  for (const w of wrap(doc.title, bold, 12.5, W)) (text(w, M, y, 12.5, bold, ink), (y -= 16));
  y -= 4;

  // Lines table, repeated header on each page.
  const cols = [
    { label: "N°", x: M + 8 },
    // Right edges leave room for "-1 000 000 FCFA" in PU HT and Total HT.
    { label: "Désignation", x: M + 32, w: 214 },
    { label: "Qté", xr: M + 300 },
    { label: "PU HT", xr: M + 376 },
    { label: "TVA", xr: M + 410 },
    { label: "Total HT", xr: M + W - 8 },
  ];
  const tableHead = () => {
    rect(M, y - 20, W, 20, navy);
    cols.forEach((c) => {
      const t = c.label.toUpperCase();
      spaced(t, c.xr ? c.xr - spacedWidth(t, 7, bold, 0.8) : c.x!, y - 13, 7, bold, white, 0.8);
    });
    y -= 27;
  };
  const newPage = () => {
    page = pdf.addPage([...A4]);
    y = TOP;
  };
  tableHead();
  (doc.lines ?? []).forEach((l, n) => {
    const desc = wrap(l.description ?? "", regular, 9, cols[1].w!);
    const h = desc.length * 11.5 + 9;
    if (y - h < BOTTOM) (newPage(), tableHead());
    text(String(n + 1).padStart(2, "0"), cols[0].x!, y - 5, 10, regular, numberGrey);
    desc.forEach((d, i) => text(d, cols[1].x!, y - 4 - i * 11.5, 9, regular, ink));
    right(`${l.quantity ?? 0}${l.unit ? ` ${l.unit}` : ""}`, cols[2].xr!, y - 4, 9, regular, ink);
    right(money(l.unitPrice), cols[3].xr!, y - 4, 9, regular, ink);
    right(`${l.vatRate ?? doc.vatRate ?? 0} %`, cols[4].xr!, y - 4, 9, regular, ink);
    right(money(lineTotal(l)), cols[5].xr!, y - 4, 9, regular, ink);
    y -= h;
    page.drawLine({ start: { x: M, y: y + 3 }, end: { x: M + W, y: y + 3 }, thickness: 0.6, color: line });
  });

  // Totals on the right (navy block for the total, aqua for what is left to pay),
  // conditions in the left column.
  type Row = { k: string; v: string; style?: "grand" | "due" };
  const rows: Row[] = [{ k: "Total HT", v: money(doc.subtotal) }];
  for (const r of vatBreakdown(doc.lines, doc.vatRate)) rows.push({ k: `TVA ${r.rate} % sur ${money(r.base)}`, v: money(r.vat) });
  rows.push({ k: doc.kind === "credit" ? "Total de l’avoir TTC" : "Total TTC", v: money(doc.total), style: "grand" });
  if (isInvoice && (doc.amountPaid || 0) > 0) rows.push({ k: "Déjà payé", v: money(doc.amountPaid) });
  if (isInvoice && invoiceCredited(doc) > 0) rows.push({ k: "Avoirs déduits", v: money(invoiceCredited(doc)) });
  if (showBalance && doc.balance !== doc.total) rows.push({ k: "Reste à payer", v: money(doc.balance), style: "due" });
  const rowH = (r: Row) => (r.style ? 26 : 16);
  const totalsH = rows.reduce((h, r) => h + rowH(r), 0) + 4;
  if (y - 14 - totalsH < BOTTOM) newPage();
  y -= 14;
  const tw = 236, tx = M + W - tw, top = y;
  for (const r of rows) {
    if (r.style) {
      rect(tx, y - 26 + 9, tw, 26, r.style === "grand" ? navy : aqua);
      text(r.k, tx + 10, y - 8, 10.5, bold, r.style === "grand" ? white : navy);
      right(r.v, tx + tw - 10, y - 8, 10.5, bold, r.style === "grand" ? aqua : navy);
      y -= 30;
    } else {
      text(r.k, tx + 10, y, 9);
      right(r.v, tx + tw - 10, y, 9, regular, ink);
      y -= 16;
    }
  }
  const afterTotals = y;
  if (doc.conditions) {
    const condW = W - tw - 40;
    let cy = top;
    const condPage = page;
    const c = wrap(doc.conditions, regular, 8.8, condW - 12);
    const bar = (from: number, to: number) => page.drawLine({ start: { x: M, y: from + 8 }, end: { x: M, y: to }, thickness: 0.8, color: lineStrong });
    label("Conditions", M + 12, cy);
    cy -= 15;
    let barTop = top;
    for (const w of c) {
      if (cy < BOTTOM) {
        // Long conditions continue on the next page, in the same column.
        bar(barTop, cy + 8);
        newPage();
        cy = barTop = TOP;
      }
      text(w, M + 12, cy, 8.8);
      cy -= 11.5;
    }
    bar(barTop, cy + 8);
    y = page === condPage ? Math.min(afterTotals, cy) : cy;
  } else y = afterTotals;

  if (doc.kind === "quote") {
    if (y - 104 < BOTTOM) newPage();
    y -= 22;
    page.drawRectangle({ x: M, y: y - 84, width: W, height: 84, borderColor: lineStrong, borderWidth: 0.8 });
    rect(M, y - 2.5, W, 2.5, navy);
    label("Bon pour accord", M + 12, y - 18);
    text("Date, nom, signature et cachet du client :", M + 12, y - 32, 9, regular, muted);
    y -= 84;
  }

  // Band, footer, page numbers and draft watermark on every page.
  const pages = pdf.getPages();
  const legal = pdfText(`${LEGAL.name} · ${LEGAL.form} au capital de ${LEGAL.capital} · RCCM ${LEGAL.rccm} · NINEA ${LEGAL.ninea}`);
  pages.forEach((p, i) => {
    p.drawRectangle({ x: 0, y: A4[1] - 6, width: A4[0], height: 6, color: navy });
    p.drawRectangle({ x: 0, y: A4[1] - 6, width: M + 32, height: 6, color: aqua });
    p.drawLine({ start: { x: M, y: M - 6 }, end: { x: A4[0] - M, y: M - 6 }, thickness: 0.6, color: lineStrong });
    p.drawRectangle({ x: M, y: M - 20, width: 5, height: 5, color: aqua });
    p.drawText(legal, { x: M + 11, y: M - 20, size: 7.3, font: regular, color: muted });
    const n = `${i + 1} / ${pages.length}`;
    p.drawText(n, { x: A4[0] - M - regular.widthOfTextAtSize(n, 7.3), y: M - 20, size: 7.3, font: regular, color: muted });
    if (!doc.number)
      p.drawText("BROUILLON", { x: 150, y: 330, size: 84, font: bold, color: bad, opacity: 0.07, rotate: degrees(28) });
  });
  return pdf.save();
}
export const documentFilename = (doc: Pick<CrmDocument, "number" | "kind">) =>
  `${doc.number ?? `${doc.kind === "credit" ? "avoir" : doc.kind === "invoice" ? "facture" : "devis"}-brouillon`}.pdf`;
