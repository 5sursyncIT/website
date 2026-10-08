import Link from "next/link";
import { notFound } from "next/navigation";
import { as, crmContext, formatDate } from "@/lib/crm-server";
import { money } from "@/lib/crm";
import { relationID } from "@/lib/access";
import { deleteDeal } from "../../actions";
import { Submit } from "@/components/crm/client";
import { ActivityForm, ClientLink, DealForm, DealStage, DocumentRows, Flash, Head, Timeline } from "@/components/crm/parts";
import { database } from "@/lib/database";
import { reminderStates } from "@/lib/crm-reminders";
export const metadata = { title: "Opportunité" };
type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
export default async function DealPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ id: raw }, search] = await Promise.all([params, searchParams]);
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const ctx = await crmContext();
  const { payload } = ctx;
  const deal = await payload.findByID({ collection: "crm-deals", id, depth: 1, disableErrors: true, ...as(ctx) });
  if (!deal) notFound();
  const client = Number(relationID(deal.client));
  const [contacts, activities, admins, documents] = await Promise.all([
    payload.find({ collection: "crm-contacts", where: { client: { equals: client } }, sort: "name", pagination: false, depth: 0, ...as(ctx) }),
    payload.find({ collection: "crm-activities", where: { deal: { equals: id } }, sort: "-createdAt", limit: 100, depth: 1, ...as(ctx) }),
    payload.find({ collection: "admins", pagination: false, depth: 0, ...as(ctx) }),
    payload.find({ collection: "crm-documents", where: { deal: { equals: id } }, sort: "-createdAt", pagination: false, depth: 0, ...as(ctx) }),
  ]);
  const reminders = await reminderStates(database(), activities.docs.map((a) => a.id));
  const back = `/crm/opportunites/${id}`;
  return (
    <>
      <Head title={deal.title} eyebrow={<><Link href="/crm/opportunites">← Opportunités</Link> · <ClientLink client={deal.client} /></>}>
        <DealStage stage={deal.stage} />
      </Head>
      <Flash search={search} />
      <section className="crm-facts">
        <div><span>Montant estimé</span><strong>{money(deal.amount)}</strong></div>
        <div><span>Probabilité</span><strong>{deal.probability ?? 0} %</strong><small>pondéré {money(((deal.amount || 0) * (deal.probability ?? 0)) / 100)}</small></div>
        <div><span>Clôture prévue</span><strong>{formatDate(deal.expectedClose)}</strong></div>
        <div><span>Conclue le</span><strong>{formatDate(deal.closedAt)}</strong></div>
        <div><span>Contact</span><strong>{deal.contact && typeof deal.contact === "object" ? <Link href={`/crm/contacts/${deal.contact.id}`}>{deal.contact.name}</Link> : "—"}</strong></div>
        <div><span>Responsable</span><strong>{deal.owner && typeof deal.owner === "object" ? deal.owner.name || deal.owner.email : "—"}</strong></div>
      </section>
      {deal.stage === "lost" && deal.lostReason && <p className="crm-hint">Raison de la perte : {deal.lostReason}</p>}
      <div className="crm-cols crm-cols--wide">
        <section className="crm-card">
          <h2>Activités liées</h2>
          <details className="crm-add">
            <summary>+ Noter un échange ou planifier une relance</summary>
            <ActivityForm clientID={client} dealID={id} contacts={contacts.docs} admins={admins.docs} back={back} />
          </details>
          <Timeline activities={activities.docs} back={back} reminders={reminders} />
          <h3>Devis et factures</h3>
          <DocumentRows documents={documents.docs} />
          <div className="crm-row-actions">
            <Link className="crm-btn crm-btn--small" href={`/crm/documents/nouveau?type=devis&entreprise=${client}&opportunite=${id}`}>+ Devis pour cette opportunité</Link>
          </div>
        </section>
        <div className="crm-stack">
          <section className="crm-card">
            <h2>Modifier</h2>
            <DealForm deal={deal} contacts={contacts.docs} admins={admins.docs} back={back} />
          </section>
          <form action={deleteDeal} className="crm-danger">
            <input type="hidden" name="id" value={id} />
            <Submit className="crm-btn crm-btn--danger" confirm="Supprimer cette opportunité ? Ses activités restent dans l’historique de l’entreprise.">
              Supprimer l’opportunité
            </Submit>
          </form>
        </div>
      </div>
    </>
  );
}
