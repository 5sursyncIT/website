import Link from "next/link";
import { notFound } from "next/navigation";
import { as, crmContext, formatDate } from "@/lib/crm-server";
import { documentKindLabel, invoiceCredited, lineTotal, money, vatBreakdown } from "@/lib/crm";
import { LEGAL } from "@/lib/legal";
import { contactDetails } from "@/lib/contact-details";
import { PrintButton } from "@/components/crm/client";
export const metadata = { title: "Aperçu" };
type Params = Promise<{ id: string }>;
// A4 sheet: the browser prints it or saves it as PDF (no PDF library, no upload).
export default async function Preview({ params }: { params: Params }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const ctx = await crmContext();
  const doc = await ctx.payload.findByID({ collection: "crm-documents", id, depth: 1, disableErrors: true, ...as(ctx) });
  if (!doc) notFound();
  const company = await contactDetails();
  const client = typeof doc.client === "object" ? doc.client : null;
  const contact = doc.contact && typeof doc.contact === "object" ? doc.contact : null;
  const isInvoice = doc.kind === "invoice";
  const title = documentKindLabel(doc.kind, doc.invoiceType);
  const creditFor = doc.creditFor && typeof doc.creditFor === "object" ? doc.creditFor : null;
  return (
    <>
      <div className="crm-preview-bar no-print">
        <Link href={`/crm/documents/${id}`}>← Retour au document</Link>
        <span className="crm-head__actions"><a className="crm-btn crm-btn--ghost" href={`/crm/documents/${id}/pdf`}>Télécharger le PDF</a><PrintButton /></span>
      </div>
      {!doc.number && <p className="crm-flash crm-flash--error no-print">Brouillon : pas encore de numéro. Émettez ou envoyez le document avant de le transmettre.</p>}
      <article className="crm-sheet">
        {!doc.number && <div className="crm-sheet__draft" aria-hidden="true">BROUILLON</div>}
        <header className="crm-sheet__head">
          <div>
            <img src="/assets/logo-horizontal.jpeg" alt="5/Sync IT" width={220} height={46} />
            <p>{LEGAL.seat(company.address)}</p>
            <p>{company.phones.map((p) => p.display).join(" · ")}</p>
            <p>{company.email}</p>
          </div>
          <div className="crm-sheet__title">
            <h1>{title}</h1>
            <p><strong>{doc.number ?? "Brouillon"}</strong></p>
            <p>Date : {formatDate(doc.issueDate ?? doc.createdAt)}</p>
            {isInvoice && <p>Échéance : {formatDate(doc.dueDate)}</p>}
            {doc.kind === "quote" && <p>Valable jusqu’au : {formatDate(doc.validUntil)}</p>}
            {creditFor && <p>Sur la facture {creditFor.number}</p>}
            {doc.status === "cancelled" && <p className="crm-sheet__cancelled">ANNULÉE</p>}
            {isInvoice && doc.status === "paid" && <p>Soldée le {formatDate(doc.paidAt)}</p>}
          </div>
        </header>
        <section className="crm-sheet__client">
          <p className="crm-sheet__label">{doc.kind === "quote" ? "Destinataire" : "Facturé à"}</p>
          <p><strong>{client?.name}</strong></p>
          {contact && <p>À l’attention de {contact.name}{contact.jobTitle ? `, ${contact.jobTitle}` : ""}</p>}
          {client?.address && <p>{client.address}</p>}
          {(client?.city || client?.country) && <p>{[client?.city, client?.country].filter(Boolean).join(", ")}</p>}
          {client?.registration && <p>NINEA / RCCM : {client.registration}</p>}
        </section>
        <p className="crm-sheet__object"><strong>Objet :</strong> {doc.title}</p>
        <table className="crm-sheet__lines">
          <thead><tr><th>Désignation</th><th className="num">Qté</th><th className="num">Prix unitaire HT</th><th className="num">TVA</th><th className="num">Total HT</th></tr></thead>
          <tbody>
            {(doc.lines ?? []).map((l, n) => (
              <tr key={l.id ?? n}>
                <td className="crm-pre">{l.description}</td>
                <td className="num">{l.quantity}{l.unit ? ` ${l.unit}` : ""}</td>
                <td className="num">{money(l.unitPrice)}</td>
                <td className="num">{l.vatRate ?? doc.vatRate ?? 0} %</td>
                <td className="num">{money(lineTotal(l))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="crm-sheet__totals">
          <tbody>
            <tr><th>Total HT</th><td className="num">{money(doc.subtotal)}</td></tr>
            {vatBreakdown(doc.lines, doc.vatRate).map((r) => (
              <tr key={r.rate}><th>TVA {r.rate} % sur {money(r.base)}</th><td className="num">{money(r.vat)}</td></tr>
            ))}
            <tr className="crm-sheet__grand"><th>{doc.kind === "credit" ? "Total de l’avoir TTC" : "Total TTC"}</th><td className="num">{money(doc.total)}</td></tr>
            {isInvoice && (doc.amountPaid ?? 0) > 0 && <tr><th>Déjà payé</th><td className="num">{money(doc.amountPaid)}</td></tr>}
            {isInvoice && invoiceCredited(doc) > 0 && <tr><th>Avoirs déduits</th><td className="num">{money(invoiceCredited(doc))}</td></tr>}
            {isInvoice && doc.status !== "cancelled" && doc.balance != null && doc.balance !== doc.total && (
              <tr className="crm-sheet__grand"><th>Reste à payer</th><td className="num">{money(doc.balance)}</td></tr>
            )}
          </tbody>
        </table>
        {doc.conditions && <section className="crm-sheet__conditions"><p className="crm-sheet__label">Conditions</p><p className="crm-pre">{doc.conditions}</p></section>}
        {!isInvoice && <p className="crm-sheet__sign">Bon pour accord (date, nom, signature et cachet du client) :</p>}
        <footer className="crm-sheet__foot">
          {LEGAL.name} · {LEGAL.form} au capital de {LEGAL.capital} · RCCM {LEGAL.rccm} · NINEA {LEGAL.ninea}
        </footer>
      </article>
    </>
  );
}
