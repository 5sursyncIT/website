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
const navy = rgb(9 / 255, 34 / 255, 52 / 255), grey = rgb(0.35, 0.38, 0.42), line = rgb(0.85, 0.88, 0.91);
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
  const logo = await pdf.embedJpg(await readFile(path.resolve("public/assets/logo-horizontal.jpeg")));
  const title = doc.kind === "credit" ? "AVOIR" : documentKindLabel(doc.kind, doc.invoiceType).toUpperCase();
  pdf.setTitle(pdfText(`${title} ${doc.number ?? "brouillon"} — 5/Sync IT`));
  pdf.setAuthor("5/Sync IT");
  pdf.setCreator("CRM 5/Sync IT");
  const client = typeof doc.client === "object" ? doc.client : null;
  const contact = doc.contact && typeof doc.contact === "object" ? doc.contact : null;
  let page: PDFPage = pdf.addPage([...A4]);
  let y = A4[1] - M;
  const text = (t: unknown, x: number, yy: number, size = 9.5, font = regular, color = rgb(0.07, 0.07, 0.07)) =>
    page.drawText(pdfText(t), { x, y: yy, size, font, color });
  const right = (t: unknown, xr: number, yy: number, size = 9.5, font = regular, color = rgb(0.07, 0.07, 0.07)) =>
    text(t, xr - font.widthOfTextAtSize(pdfText(t), size), yy, size, font, color);
  const W = A4[0] - 2 * M;
  // Header: company on the left, document identity on the right.
  const lw = 170, lh = (logo.height / logo.width) * lw;
  page.drawImage(logo, { x: M, y: y - lh, width: lw, height: lh });
  let cy = y - lh - 14;
  for (const l of [LEGAL.seat(company.address), company.phones.map((p) => p.display).join(" · "), company.email])
    for (const w of wrap(l, regular, 8.5, 270)) (text(w, M, cy, 8.5, regular, grey), (cy -= 11));
  right(title, A4[0] - M, y - 18, 20, bold, navy);
  let ry = y - 40;
  const meta = [
    doc.number ?? "Brouillon",
    `Date : ${day(doc.issueDate ?? doc.createdAt)}`,
    doc.kind === "quote" ? `Valable jusqu’au : ${day(doc.validUntil)}` : doc.kind === "invoice" ? `Échéance : ${day(doc.dueDate)}` : creditFor ? `Sur la facture ${creditFor}` : "",
    doc.status === "cancelled" ? "ANNULÉE" : doc.kind === "invoice" && doc.status === "paid" ? `Soldée le ${day(doc.paidAt)}` : "",
  ].filter(Boolean);
  meta.forEach((m, i) => (right(m, A4[0] - M, ry, i === 0 ? 11 : 9.5, i === 0 || m === "ANNULÉE" ? bold : regular), (ry -= 14)));
  y = Math.min(cy, ry) - 12;
  // Client box.
  const clientLines = [
    client?.name ?? "",
    contact ? `À l’attention de ${contact.name}${contact.jobTitle ? `, ${contact.jobTitle}` : ""}` : "",
    client?.address ?? "",
    [client?.city, client?.country].filter(Boolean).join(", "),
    client?.registration ? `NINEA / RCCM : ${client.registration}` : "",
  ].filter(Boolean);
  const bx = A4[0] - M - 250, bh = 24 + clientLines.length * 13;
  page.drawRectangle({ x: bx, y: y - bh, width: 250, height: bh, borderColor: line, borderWidth: 1 });
  text(doc.kind === "quote" ? "DESTINATAIRE" : "FACTURÉ À", bx + 10, y - 14, 7.5, bold, grey);
  clientLines.forEach((l, i) => text(wrap(l, i ? regular : bold, 9.5, 230)[0], bx + 10, y - 28 - i * 13, 9.5, i ? regular : bold));
  y -= bh + 22;
  for (const w of wrap(`Objet : ${doc.title}`, bold, 10, W)) (text(w, M, y, 10, bold), (y -= 14));
  y -= 6;
  // Lines table, repeated header on each page.
  const cols = [
    // Right edges leave room for "-1 000 000 FCFA" in PU HT and Total HT.
    { label: "Désignation", x: M + 6, w: 236 },
    { label: "Qté", xr: M + 296 },
    { label: "PU HT", xr: M + 372 },
    { label: "TVA", xr: M + 404 },
    { label: "Total HT", xr: M + W - 6 },
  ];
  const tableHead = () => {
    page.drawRectangle({ x: M, y: y - 18, width: W, height: 18, color: navy });
    cols.forEach((c) => (c.xr ? right(c.label, c.xr, y - 12.5, 8.5, bold, rgb(1, 1, 1)) : text(c.label, c.x!, y - 12.5, 8.5, bold, rgb(1, 1, 1))));
    y -= 24;
  };
  const newPage = () => {
    page = pdf.addPage([...A4]);
    y = A4[1] - M;
  };
  tableHead();
  for (const l of doc.lines ?? []) {
    const desc = wrap(l.description ?? "", regular, 9, cols[0].w!);
    const h = desc.length * 11.5 + 8;
    if (y - h < M + 40) (newPage(), tableHead());
    desc.forEach((d, i) => text(d, cols[0].x!, y - 4 - i * 11.5, 9));
    right(`${l.quantity ?? 0}${l.unit ? ` ${l.unit}` : ""}`, cols[1].xr!, y - 4, 9);
    right(money(l.unitPrice), cols[2].xr!, y - 4, 9);
    right(`${l.vatRate ?? doc.vatRate ?? 0} %`, cols[3].xr!, y - 4, 9);
    right(money(lineTotal(l)), cols[4].xr!, y - 4, 9);
    y -= h;
    page.drawLine({ start: { x: M, y: y + 3 }, end: { x: M + W, y: y + 3 }, thickness: 0.6, color: line });
  }
  // Totals, with the VAT detail per rate.
  const rows: [string, string, boolean?][] = [["Total HT", money(doc.subtotal)]];
  for (const r of vatBreakdown(doc.lines, doc.vatRate)) rows.push([`TVA ${r.rate} % sur ${money(r.base)}`, money(r.vat)]);
  rows.push([doc.kind === "credit" ? "Total de l’avoir TTC" : "Total TTC", money(doc.total), true]);
  if (doc.kind === "invoice" && (doc.amountPaid || 0) > 0) rows.push(["Déjà payé", money(doc.amountPaid)]);
  if (doc.kind === "invoice" && invoiceCredited(doc) > 0) rows.push(["Avoirs déduits", money(invoiceCredited(doc))]);
  if (doc.kind === "invoice" && doc.status !== "cancelled" && doc.balance != null && doc.balance !== doc.total) rows.push(["Reste à payer", money(doc.balance), true]);
  if (y - rows.length * 16 < M + 40) newPage();
  y -= 8;
  for (const [k, v, strong] of rows) {
    if (strong) page.drawLine({ start: { x: M + W - 250, y: y + 11 }, end: { x: M + W, y: y + 11 }, thickness: 1.2, color: navy });
    text(k, M + W - 244, y, strong ? 10.5 : 9.5, strong ? bold : regular);
    right(v, M + W - 6, y, strong ? 10.5 : 9.5, strong ? bold : regular);
    y -= strong ? 19 : 15;
  }
  if (doc.conditions) {
    const c = wrap(doc.conditions, regular, 9, W);
    if (y - 20 - c.length * 11.5 < M + 40) newPage();
    y -= 12;
    text("CONDITIONS", M, y, 7.5, bold, grey);
    y -= 13;
    c.forEach((w) => (text(w, M, y, 9), (y -= 11.5)));
  }
  if (doc.kind === "quote") {
    if (y - 90 < M + 40) newPage();
    y -= 18;
    page.drawRectangle({ x: M, y: y - 70, width: W, height: 70, borderColor: line, borderWidth: 1, borderDashArray: [3, 3] });
    text("Bon pour accord (date, nom, signature et cachet du client) :", M + 10, y - 16, 9, regular, grey);
  }
  // Footer, page numbers and draft watermark on every page.
  const pages = pdf.getPages();
  const legal = pdfText(`${LEGAL.name} · ${LEGAL.form} au capital de ${LEGAL.capital} · RCCM ${LEGAL.rccm} · NINEA ${LEGAL.ninea}`);
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M - 8 }, end: { x: A4[0] - M, y: M - 8 }, thickness: 0.6, color: line });
    p.drawText(legal, { x: (A4[0] - regular.widthOfTextAtSize(legal, 7.5)) / 2, y: M - 20, size: 7.5, font: regular, color: grey });
    const n = `${i + 1} / ${pages.length}`;
    p.drawText(n, { x: A4[0] - M - regular.widthOfTextAtSize(n, 7.5), y: M - 20, size: 7.5, font: regular, color: grey });
    if (!doc.number)
      p.drawText("BROUILLON", { x: 150, y: 330, size: 84, font: bold, color: rgb(0.71, 0.14, 0.09), opacity: 0.08, rotate: degrees(28) });
  });
  return pdf.save();
}
export const documentFilename = (doc: Pick<CrmDocument, "number" | "kind">) =>
  `${doc.number ?? `${doc.kind === "credit" ? "avoir" : doc.kind === "invoice" ? "facture" : "devis"}-brouillon`}.pdf`;
