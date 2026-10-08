import Link from "next/link";
import { notFound } from "next/navigation";
import { as, crmContext, formatDate, formatDateTime } from "@/lib/crm-server";
import { documentEditable, documentKindLabel, documentStatusLabel, documentTransitions, invoiceCredited, lineTotal, money, vatBreakdown } from "@/lib/crm";
import { relationID } from "@/lib/access";
import { database } from "@/lib/database";
import { crmEmailEnabled } from "@/lib/crm-reminders";
import { documentMails } from "@/lib/crm-document-mail";
import { addPayment, creditFromInvoice, deleteDocument, deletePayment, depositFromQuote, emailDocument, invoiceFromQuote, setDocumentStatus } from "../../actions";
import { Submit } from "@/components/crm/client";
import { ClientLink, DocumentForm, DocumentRows, DocumentStatus, Flash, Head } from "@/components/crm/parts";
export const metadata = { title: "Devis ou facture" };
type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
// Button wording per status move; moves that need care ask for confirmation.
const moves: Record<string, Record<string, [string, string?]>> = {
  quote: {
    sent: ["Marquer comme envoyé"],
    accepted: ["Accepté par le client"],
    refused: ["Refusé par le client"],
    draft: ["Repasser en brouillon"],
  },
  invoice: {
    issued: ["Émettre la facture", "Émettre la facture ? Elle reçoit son numéro définitif et ne pourra plus être modifiée."],
    cancelled: ["Annuler la facture", "Annuler cette facture ? Elle reste numérotée et visible, marquée « Annulée ». Si elle a été envoyée au client, préférez un avoir."],
  },
  credit: {
    issued: ["Émettre l’avoir", "Émettre l’avoir ? Il reçoit son numéro définitif, ne pourra plus être modifié et réduit le reste dû de la facture."],
  },
};
const mailStates: Record<string, [string, string]> = {
  accepted: ["accepté par le serveur", "ok"],
  failed: ["refusé", "off"],
  uncertain: ["incertain", "wait"],
  dispatching: ["en cours", "info"],
};
const today = () => new Date().toISOString().slice(0, 10);
export default async function DocumentPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ id: raw }, search] = await Promise.all([params, searchParams]);
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const ctx = await crmContext();
  const { payload } = ctx;
  const doc = await payload.findByID({ collection: "crm-documents", id, depth: 1, disableErrors: true, ...as(ctx) });
  if (!doc) notFound();
  const client = Number(relationID(doc.client));
  const editable = documentEditable(doc.kind, doc.status);
  const none = { docs: [] };
  const [contacts, deals, related, credits, mails] = await Promise.all([
    editable ? payload.find({ collection: "crm-contacts", where: { client: { equals: client } }, sort: "name", pagination: false, depth: 0, select: { name: true, client: true }, ...as(ctx) }) : none,
    editable ? payload.find({ collection: "crm-deals", where: { client: { equals: client } }, sort: "-updatedAt", pagination: false, depth: 0, select: { title: true }, ...as(ctx) }) : none,
    doc.kind === "quote" ? payload.find({ collection: "crm-documents", where: { sourceQuote: { equals: id } }, sort: "createdAt", pagination: false, depth: 0, ...as(ctx) }) : none,
    doc.kind === "invoice" ? payload.find({ collection: "crm-documents", where: { creditFor: { equals: id } }, sort: "createdAt", pagination: false, depth: 0, ...as(ctx) }) : none,
    doc.number ? documentMails(database(), id) : Promise.resolve([]),
  ]);
  const back = `/crm/documents/${id}`;
  const next = documentTransitions[doc.kind][doc.status] ?? [];
  const label = `${documentKindLabel(doc.kind, doc.invoiceType)} ${doc.number ?? "brouillon"}`;
  const finalInvoice = related.docs.find((d) => d.invoiceType !== "deposit" && d.status !== "cancelled");
  const creditFor = doc.creditFor && typeof doc.creditFor === "object" ? doc.creditFor : null;
  const contact = doc.contact && typeof doc.contact === "object" ? doc.contact : null;
  const company = typeof doc.client === "object" ? doc.client : null;
  const recipient = contact?.email || company?.email || "";
  const kindWord = doc.kind === "credit" ? "l’avoir" : doc.kind === "quote" ? "le devis" : "la facture";
  const mailText = `Bonjour${contact ? ` ${contact.name}` : ""},\n\nVeuillez trouver ci-joint ${kindWord} ${doc.number ?? ""} (${money(doc.total)} TTC) : ${doc.title}.\n\nNous restons à votre disposition pour toute question.\n\nCordialement,\n${"name" in ctx.user && ctx.user.name ? ctx.user.name : ""}\n5/Sync IT`;
  const emailOn = crmEmailEnabled();
  return (
    <>
      <Head title={label} eyebrow={<><Link href="/crm/documents">← Devis et factures</Link> · <ClientLink client={doc.client} /></>}>
        <DocumentStatus doc={doc} />
        <a className="crm-btn crm-btn--ghost" href={`/crm/documents/${id}/pdf`}>Télécharger le PDF</a>
        <Link className="crm-btn" href={`/crm/documents/${id}/apercu`}>Aperçu et impression</Link>
      </Head>
      <Flash search={search} />
      <section className="crm-facts">
        <div><span>Objet</span><strong>{doc.title}</strong></div>
        <div><span>Total HT</span><strong>{money(doc.subtotal)}</strong></div>
        {vatBreakdown(doc.lines, doc.vatRate).map((r) => (
          <div key={r.rate}><span>TVA {r.rate} %</span><strong>{money(r.vat)}</strong><small>sur {money(r.base)}</small></div>
        ))}
        <div><span>{doc.kind === "credit" ? "Total de l’avoir TTC" : "Total TTC"}</span><strong>{money(doc.total)}</strong></div>
        {doc.kind === "invoice" && doc.number && doc.status !== "cancelled" && (
          <div><span>Reste à payer</span><strong className={(doc.balance ?? 0) > 0 ? "crm-late" : ""}>{money(doc.balance)}</strong><small>payé {money(doc.amountPaid)}{invoiceCredited(doc) > 0 ? ` · avoirs ${money(invoiceCredited(doc))}` : ""}</small></div>
        )}
        <div><span>Date d’émission</span><strong>{formatDate(doc.issueDate)}</strong></div>
        {doc.kind === "quote" && <div><span>Valable jusqu’au</span><strong>{formatDate(doc.validUntil)}</strong></div>}
        {doc.kind === "invoice" && <div><span>Échéance</span><strong>{formatDate(doc.dueDate)}</strong>{doc.paidAt && <small>soldée le {formatDate(doc.paidAt)}</small>}</div>}
        {doc.kind !== "credit" && <div><span>Opportunité</span><strong>{doc.deal && typeof doc.deal === "object" ? <Link href={`/crm/opportunites/${doc.deal.id}`}>{doc.deal.title}</Link> : "—"}</strong></div>}
        <div><span>À l’attention de</span><strong>{contact?.name ?? "—"}</strong></div>
      </section>
      {doc.sourceQuote && typeof doc.sourceQuote === "object" && (
        <p className="crm-hint">Créée à partir du <Link href={`/crm/documents/${doc.sourceQuote.id}`}>devis {doc.sourceQuote.number ?? "brouillon"}</Link>.</p>
      )}
      {creditFor && <p className="crm-hint">Avoir sur la <Link href={`/crm/documents/${creditFor.id}`}>facture {creditFor.number}</Link> ({money(creditFor.total)} TTC).</p>}

      <section className="crm-card">
        <h2>Suivi</h2>
        <div className="crm-status-actions">
          {next.map((status) => {
            const [text, confirm] = moves[doc.kind][status] ?? [documentStatusLabel(doc.kind, status)];
            return (
              <form key={status} action={setDocumentStatus} className="crm-inline-form">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="status" value={status} />
                <input type="hidden" name="back" value={back} />
                <Submit className={`crm-btn${["refused", "cancelled", "draft"].includes(status) ? " crm-btn--ghost" : ""}`} confirm={confirm}>{text}</Submit>
              </form>
            );
          })}
          {doc.kind === "invoice" && doc.number && doc.status !== "cancelled" && (
            <form action={creditFromInvoice}>
              <input type="hidden" name="id" value={id} />
              <Submit className="crm-btn crm-btn--ghost">Créer un avoir</Submit>
            </form>
          )}
        </div>
        <p className="crm-hint">
          {doc.kind === "quote" && "Le numéro est attribué à l’envoi. « Accepté » fait gagner l’opportunité liée."}
          {doc.kind === "invoice" && "Le numéro est attribué à l’émission ; ensuite la facture ne se modifie plus. Pour la corriger après envoi, établissez un avoir (total ou partiel) puis une nouvelle facture."}
          {doc.kind === "credit" && "Un avoir émis est définitif et réduit le reste dû de sa facture (il peut la solder)."}
        </p>
      </section>

      {doc.kind === "quote" && doc.number && doc.status !== "refused" && (
        <section className="crm-card">
          <h2>Facturation du devis</h2>
          <div className="crm-status-actions">
            <form action={depositFromQuote} className="crm-inline-form">
              <input type="hidden" name="id" value={id} />
              <label className="crm-inline-label">Acompte de
                <input name="percent" type="number" min={1} max={99} defaultValue={30} required aria-label="Pourcentage d’acompte" className="crm-percent" /> %
              </label>
              <Submit className="crm-btn crm-btn--ghost">Créer la facture d’acompte</Submit>
            </form>
            {finalInvoice ? (
              <Link className="crm-btn crm-btn--ghost" href={`/crm/documents/${finalInvoice.id}`}>Voir la facture {finalInvoice.number ?? "brouillon"}</Link>
            ) : (
              <form action={invoiceFromQuote}>
                <input type="hidden" name="id" value={id} />
                <Submit className={`crm-btn${doc.status === "accepted" ? "" : " crm-btn--ghost"}`}>Créer la facture {related.docs.some((d) => d.invoiceType === "deposit") ? "de solde" : ""}</Submit>
              </form>
            )}
          </div>
          <p className="crm-hint">La facture de solde reprend les lignes du devis et déduit automatiquement les factures d’acompte émises.</p>
          {related.docs.length > 0 && <DocumentRows documents={related.docs} />}
        </section>
      )}

      {doc.kind === "invoice" && doc.number && doc.status !== "cancelled" && (
        <section className="crm-card">
          <h2>Paiements</h2>
          {(doc.payments ?? []).length ? (
            <div className="crm-table-wrap">
              <table className="crm-table">
                <thead><tr><th>Date</th><th>Mode et référence</th><th className="num">Montant</th><th /></tr></thead>
                <tbody>
                  {(doc.payments ?? []).map((p) => (
                    <tr key={p.id}>
                      <td>{formatDate(p.date)}</td>
                      <td>{p.note || "—"}</td>
                      <td className="num">{money(p.amount)}</td>
                      <td className="num">
                        <form action={deletePayment}>
                          <input type="hidden" name="id" value={id} />
                          <input type="hidden" name="payment" value={p.id ?? ""} />
                          <Submit className="crm-btn crm-btn--small crm-btn--ghost" confirm="Supprimer ce paiement ?">Supprimer</Submit>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="crm-empty">Aucun paiement enregistré.</p>
          )}
          {(doc.balance ?? 0) > 0 && (
            <>
              <form action={addPayment} className="crm-inline-form crm-payment">
                <input type="hidden" name="id" value={id} />
                <label className="crm-inline-label">Montant (FCFA)<input name="amount" inputMode="numeric" required defaultValue={doc.balance ?? ""} aria-label="Montant du paiement" /></label>
                <label className="crm-inline-label">Date<input name="date" type="date" required defaultValue={today()} aria-label="Date du paiement" /></label>
                <label className="crm-inline-label crm-grow">Mode et référence<input name="note" maxLength={200} placeholder="Virement, chèque n°…, Wave…" aria-label="Mode et référence" /></label>
                <Submit className="crm-btn">Enregistrer le paiement</Submit>
              </form>
              <p className="crm-hint">Paiement partiel : saisissez le montant reçu. La facture est « Soldée » quand le reste à payer atteint zéro (paiements et avoirs).</p>
            </>
          )}
          {credits.docs.length > 0 && <><h3>Avoirs</h3><DocumentRows documents={credits.docs} /></>}
        </section>
      )}

      {doc.number && (
        <section className="crm-card">
          <h2>Envoyer par email</h2>
          {emailOn ? (
            <form action={emailDocument} className="crm-form">
              <input type="hidden" name="id" value={id} />
              <div className="crm-grid">
                <label>Destinataire *<input name="to" type="email" required maxLength={150} defaultValue={recipient} /></label>
                <label className="crm-span-2">Objet *<input name="subject" required maxLength={180} defaultValue={`${documentKindLabel(doc.kind, doc.invoiceType)} ${doc.number} — 5/Sync IT`} /></label>
                <label className="crm-span-all">Message *<textarea name="message" rows={8} required maxLength={5000} defaultValue={mailText} /></label>
              </div>
              <p className="crm-hint">Envoyé depuis no-reply@5sursync.com avec le PDF en pièce jointe ; les réponses du client vous arrivent directement, et vous recevez une copie cachée. Chaque clic envoie un nouvel email.</p>
              <Submit confirm={`Envoyer ${kindWord} ${doc.number} par email ?`}>Envoyer avec le PDF</Submit>
            </form>
          ) : (
            <p className="crm-hint crm-reminder-status">L’envoi d’emails n’est pas activé sur ce serveur : aucun email ne part. Téléchargez le PDF et envoyez-le depuis votre messagerie.</p>
          )}
          {mails.length > 0 && (
            <ul className="crm-list">
              {mails.map((m, n) => (
                <li key={n}>
                  <span>{m.recipient} <span className={`crm-badge crm-badge--${mailStates[m.state]?.[1] ?? "info"}`}>{mailStates[m.state]?.[0] ?? m.state}</span></span>
                  <small>{formatDateTime(m.created_at)}{m.sender ? ` · par ${m.sender}` : ""} · {m.subject}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {editable ? (
        <section className="crm-card">
          <h2>Contenu</h2>
          <DocumentForm doc={doc} kind={doc.kind} contacts={contacts.docs} deals={deals.docs} back={back} />
        </section>
      ) : (
        <section className="crm-card">
          <h2>Lignes</h2>
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead><tr><th>Désignation</th><th className="num">Quantité</th><th className="num">Prix unitaire HT</th><th className="num">TVA</th><th className="num">Total HT</th></tr></thead>
              <tbody>
                {(doc.lines ?? []).map((l, n) => (
                  <tr key={l.id ?? n}>
                    <td className="crm-pre">{l.description}</td>
                    <td className="num">{l.quantity} {l.unit}</td>
                    <td className="num">{money(l.unitPrice)}</td>
                    <td className="num">{l.vatRate ?? doc.vatRate ?? 0} %</td>
                    <td className="num">{money(lineTotal(l))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {doc.conditions && <p className="crm-pre crm-notes">{doc.conditions}</p>}
          {doc.notes && <p className="crm-hint">Notes internes : {doc.notes}</p>}
        </section>
      )}
      {!doc.number && (
        <form action={deleteDocument} className="crm-danger">
          <input type="hidden" name="id" value={id} />
          <Submit className="crm-btn crm-btn--danger" confirm="Supprimer ce brouillon ?">Supprimer le brouillon</Submit>
        </form>
      )}
    </>
  );
}
