// CRM vocabulary shared by the collections, the /crm pages and the CSV export.
export const clientStages = [
  ["prospect", "Prospect"],
  ["client", "Client"],
  ["inactive", "Ancien client"],
] as const;
export const clientSources = [
  ["site-web", "Formulaire du site"],
  ["recommandation", "Recommandation"],
  ["prospection", "Prospection directe"],
  ["appel-offres", "Appel d’offres"],
  ["partenaire", "Partenaire"],
  ["salon", "Salon / événement"],
  ["autre", "Autre"],
] as const;
// Open stages first, in pipeline order; won/lost close the deal.
export const dealStages = [
  ["lead", "Piste", 10],
  ["qualified", "Qualifiée", 25],
  ["proposal", "Proposition envoyée", 50],
  ["negotiation", "Négociation", 75],
  ["won", "Gagnée", 100],
  ["lost", "Perdue", 0],
] as const;
export const openDealStages = ["lead", "qualified", "proposal", "negotiation"] as const;
export const activityKinds = [
  ["call", "Appel"],
  ["email", "Email"],
  ["meeting", "Rendez-vous"],
  ["note", "Note"],
  ["task", "Tâche"],
] as const;
export type ClientStage = (typeof clientStages)[number][0];
export type DealStage = (typeof dealStages)[number][0];
export type ActivityKind = (typeof activityKinds)[number][0];
const label = (list: readonly (readonly [string, string, ...unknown[]])[], value: unknown) =>
  list.find(([v]) => v === value)?.[1] ?? String(value ?? "");
export const clientStageLabel = (v: unknown) => label(clientStages, v);
export const clientSourceLabel = (v: unknown) => label(clientSources, v);
export const dealStageLabel = (v: unknown) => label(dealStages, v);
export const activityKindLabel = (v: unknown) => label(activityKinds, v);
export const defaultProbability = (stage: unknown) =>
  dealStages.find(([v]) => v === stage)?.[2] ?? 10;
export const isOpenStage = (stage: unknown) =>
  (openDealStages as readonly unknown[]).includes(stage);
export const options = (list: readonly (readonly [string, string, ...unknown[]])[]) =>
  list.map(([value, label]) => ({ value, label }));
const fcfa = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
export const money = (amount: unknown) => `${fcfa.format(Number(amount) || 0)} FCFA`;
// Weighted pipeline: amount × probability.
export function weighted(deals: { amount?: number | null; probability?: number | null }[]) {
  return deals.reduce((sum, d) => sum + ((d.amount || 0) * (d.probability ?? 0)) / 100, 0);
}
// Spreadsheet formula injection: a cell starting with = + - @ tab or CR is neutralised.
export function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
export function csv(rows: unknown[][]) {
  // BOM + semicolons: opens directly in a French-locale spreadsheet.
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
// Same-site relative paths under /crm only (no open redirect).
export function safeBack(value: unknown, fallback = "/crm") {
  const path = typeof value === "string" ? value : "";
  return /^\/crm(\/[\w\-/]*)?(\?[\w\-=&%.]*)?$/.test(path) && !path.includes("//") ? path : fallback;
}
export function withMessage(path: string, key: "ok" | "erreur", message: string) {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.delete("ok");
  params.delete("erreur");
  params.set(key, message);
  return `${base}?${params}`;
}
// Search: lower case, accents removed, single spaces. Stored in search_text and
// compared with pg_trgm, so "societe", "Société" and "sociéte" all match.
export function normalizeSearch(...parts: unknown[]) {
  return parts
    .filter((p) => p != null && p !== "")
    .join(" ")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}
// Quotes, invoices and credit notes. Amounts are whole FCFA (no subunit in use).
export const documentKinds = [
  ["quote", "Devis"],
  ["invoice", "Facture"],
  ["credit", "Avoir"],
] as const;
export const quoteStatuses = [
  ["draft", "Brouillon"],
  ["sent", "Envoyé"],
  ["accepted", "Accepté"],
  ["refused", "Refusé"],
] as const;
export const invoiceStatuses = [
  ["draft", "Brouillon"],
  ["issued", "Émise"],
  ["paid", "Soldée"],
  ["cancelled", "Annulée"],
] as const;
export const creditStatuses = [
  ["draft", "Brouillon"],
  ["issued", "Émis"],
] as const;
export const invoiceTypes = [
  ["standard", "Facture"],
  ["deposit", "Facture d’acompte"],
] as const;
export type DocumentKind = (typeof documentKinds)[number][0];
const statusList = (kind: unknown) => (kind === "invoice" ? invoiceStatuses : kind === "credit" ? creditStatuses : quoteStatuses);
export const documentKindLabel = (v: unknown, invoiceType?: unknown) =>
  v === "invoice" && invoiceType === "deposit" ? "Facture d’acompte" : label(documentKinds, v);
export const documentStatusLabel = (kind: unknown, v: unknown) => label(statusList(kind), v);
export const documentStatuses = statusList;
// Status moves people may choose. "paid" (Soldée) is set by payments and credit notes,
// never chosen: an invoice is settled when its balance reaches zero.
export const documentTransitions: Record<DocumentKind, Record<string, string[]>> = {
  quote: { draft: ["sent", "accepted", "refused"], sent: ["accepted", "refused", "draft"], accepted: ["sent"], refused: ["sent"] },
  invoice: { draft: ["issued"], issued: ["cancelled"], paid: [], cancelled: [] },
  credit: { draft: ["issued"], issued: [] },
};
// Content can change only in these statuses (an issued invoice or credit note is final).
export const documentEditable = (kind: unknown, status: unknown) =>
  kind === "quote" ? status === "draft" || status === "sent" : status === "draft";
export const defaultVatRate = 18;
export type DocumentLine = { description?: string | null; quantity?: number | null; unit?: string | null; unitPrice?: number | null; vatRate?: number | null };
export const lineTotal = (l: DocumentLine) => Math.round((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0));
// Per-rate VAT: each rate's base is summed, then its VAT rounded once (as printed).
export function vatBreakdown(lines: DocumentLine[] | null | undefined, fallbackRate: number | null | undefined) {
  const rates = new Map<number, number>();
  for (const l of lines ?? []) {
    const rate = Number(l.vatRate ?? fallbackRate ?? defaultVatRate) || 0;
    rates.set(rate, (rates.get(rate) ?? 0) + lineTotal(l));
  }
  return [...rates].sort(([a], [b]) => b - a).map(([rate, base]) => ({ rate, base, vat: Math.round((base * rate) / 100) }));
}
export function documentTotals(lines: DocumentLine[] | null | undefined, fallbackRate?: number | null) {
  const breakdown = vatBreakdown(lines, fallbackRate);
  const subtotal = breakdown.reduce((s, r) => s + r.base, 0);
  const vat = breakdown.reduce((s, r) => s + r.vat, 0);
  return { subtotal, vat, total: subtotal + vat };
}
// What is still owed on an invoice: total minus payments and issued credit notes.
export function invoiceBalance(total: number | null | undefined, payments: { amount?: number | null }[] | null | undefined, credited = 0) {
  const paid = (payments ?? []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return { amountPaid: paid, balance: Math.round((Number(total) || 0) - paid - credited) };
}
// Credit notes already deducted from an invoice (what the balance does not explain by payments).
export const invoiceCredited = (doc: { total?: number | null; amountPaid?: number | null; balance?: number | null }) =>
  Math.max(0, Math.round((doc.total || 0) - (doc.amountPaid || 0) - (doc.balance ?? doc.total ?? 0)));
export const documentPrefix = (kind: DocumentKind) => (kind === "invoice" ? "FAC" : kind === "credit" ? "AV" : "DEV");
// Next number after the highest one of the year: FAC-2026-0001, FAC-2026-0002…
export function nextDocumentNumber(kind: DocumentKind, year: number, last: string | null | undefined) {
  const n = last ? Number(last.split("-").at(-1)) || 0 : 0;
  return `${documentPrefix(kind)}-${year}-${String(n + 1).padStart(4, "0")}`;
}
// Deposit lines: the chosen share of each VAT rate's base, one line per rate.
export function depositLines(quoteLines: DocumentLine[], percent: number, quoteNumber: string, fallbackRate?: number | null) {
  return vatBreakdown(quoteLines, fallbackRate).map((r) => ({
    description: `Acompte de ${percent} % sur le devis ${quoteNumber}${vatBreakdown(quoteLines, fallbackRate).length > 1 ? ` (part à TVA ${r.rate} %)` : ""}`,
    quantity: 1,
    unit: null,
    unitPrice: Math.round((r.base * percent) / 100),
    vatRate: r.rate,
  }));
}
