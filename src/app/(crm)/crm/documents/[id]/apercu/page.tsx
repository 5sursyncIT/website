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
      <article className={`crm-sheet crm-sheet--${doc.kind}`}>
        <div className="crm-sheet__band" aria-hidden="true" />
        {!doc.number && <div className="crm-sheet__draft" aria-hidden="true">BROUILLON</div>}
        <header className="crm-sheet__head">
          <img src="/assets/logo-horizontal-transparent.png" alt="5/Sync IT" width={220} height={46} />
          <div className="crm-sheet__title">
            <h1>
              <span className="crm-sheet__eyebrow">{title}</span>
              <span className="crm-sheet__number">{doc.number ?? "Brouillon"}</span>
            </h1>
            <span className="crm-sheet__rule" aria-hidden="true" />
            {doc.status === "cancelled" && <p className="crm-sheet__status crm-sheet__status--bad">Annulée</p>}
            {isInvoice && doc.status === "paid" && <p className="crm-sheet__status">Soldée le {formatDate(doc.paidAt)}</p>}
          </div>
        </header>
        <dl className="crm-sheet__meta">
          <div><dt>Date</dt><dd>{formatDate(doc.issueDate ?? doc.createdAt)}</dd></div>
          {isInvoice && <div><dt>Échéance</dt><dd>{formatDate(doc.dueDate)}</dd></div>}
          {doc.kind === "quote" && <div><dt>Valable jusqu’au</dt><dd>{formatDate(doc.validUntil)}</dd></div>}
          {creditFor && <div><dt>Facture d’origine</dt><dd>{creditFor.number}</dd></div>}
          <div><dt>{isInvoice && doc.status !== "cancelled" && doc.balance != null && doc.balance !== doc.total ? "Reste à payer" : "Montant TTC"}</dt>
            <dd>{money(isInvoice && doc.status !== "cancelled" && doc.balance != null ? doc.balance : doc.total)}</dd></div>
        </dl>
        <section className="crm-sheet__parties">
          <div>
            <p className="crm-sheet__label">Émetteur</p>
            <p><strong>{LEGAL.name}</strong></p>
            <p>{LEGAL.seat(company.address)}</p>
            <p>{company.phones.map((p) => p.display).join(" · ")}</p>
            <p>{company.email}</p>
          </div>
          <div className="crm-sheet__client">
            <p className="crm-sheet__label">{doc.kind === "quote" ? "Destinataire" : "Facturé à"}</p>
            <p><strong>{client?.name}</strong></p>
            {contact && <p>À l’attention de {contact.name}{contact.jobTitle ? `, ${contact.jobTitle}` : ""}</p>}
            {client?.address && <p>{client.address}</p>}
            {(client?.city || client?.country) && <p>{[client?.city, client?.country].filter(Boolean).join(", ")}</p>}
            {client?.registration && <p>NINEA / RCCM : {client.registration}</p>}
          </div>
        </section>
        <section className="crm-sheet__object">
          <p className="crm-sheet__label">Objet</p>
          <p className="crm-sheet__subject">{doc.title}</p>
        </section>
        <table className="crm-sheet__lines">
          <thead><tr><th className="crm-sheet__n">N°</th><th>Désignation</th><th className="num">Qté</th><th className="num">Prix unitaire HT</th><th className="num">TVA</th><th className="num">Total HT</th></tr></thead>
          <tbody>
            {(doc.lines ?? []).map((l, n) => (
              <tr key={l.id ?? n}>
                <td className="crm-sheet__n">{String(n + 1).padStart(2, "0")}</td>
                <td className="crm-pre">{l.description}</td>
                <td className="num">{l.quantity}{l.unit ? ` ${l.unit}` : ""}</td>
                <td className="num">{money(l.unitPrice)}</td>
                <td className="num">{l.vatRate ?? doc.vatRate ?? 0} %</td>
                <td className="num">{money(lineTotal(l))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="crm-sheet__summary">
          <div>
            {doc.conditions && <section className="crm-sheet__conditions"><p className="crm-sheet__label">Conditions</p><p className="crm-pre">{doc.conditions}</p></section>}
          </div>
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
                <tr className="crm-sheet__due"><th>Reste à payer</th><td className="num">{money(doc.balance)}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {doc.kind === "quote" && (
          <section className="crm-sheet__sign">
            <p className="crm-sheet__label">Bon pour accord</p>
            <p>Date, nom, signature et cachet du client :</p>
          </section>
        )}
        <footer className="crm-sheet__foot">
          {LEGAL.name} · {LEGAL.form} au capital de {LEGAL.capital} · RCCM {LEGAL.rccm} · NINEA {LEGAL.ninea}
        </footer>
      </article>
    </>
  );
}
