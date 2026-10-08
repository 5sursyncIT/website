import Link from "next/link";
import { notFound } from "next/navigation";
import { as, crmContext } from "@/lib/crm-server";
import { relationID } from "@/lib/access";
import { deleteContact } from "../../actions";
import { Submit } from "@/components/crm/client";
import { WhatsAppButton } from "@/components/crm/whatsapp";
import { MailSection } from "@/components/crm/mail";
import { waCandidates, waMode } from "@/lib/whatsapp";
import { ClientLink, ContactForm, DealRows, Flash, Head, Timeline } from "@/components/crm/parts";
export const metadata = { title: "Contact" };
type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
export default async function ContactPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ id: raw }, search] = await Promise.all([params, searchParams]);
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const ctx = await crmContext();
  const contact = await ctx.payload.findByID({ collection: "crm-contacts", id, depth: 1, disableErrors: true, ...as(ctx) });
  if (!contact) notFound();
  const [deals, activities] = await Promise.all([
    ctx.payload.find({ collection: "crm-deals", where: { contact: { equals: id } }, sort: "-updatedAt", pagination: false, depth: 0, ...as(ctx) }),
    ctx.payload.find({ collection: "crm-activities", where: { contact: { equals: id } }, sort: "-createdAt", limit: 50, depth: 1, ...as(ctx) }),
  ]);
  const back = `/crm/contacts/${id}`;
  // The country comes from the company: it decides whether +221 may be added.
  const company = typeof contact.client === "object" ? contact.client : null;
  const wa = waCandidates({ client: { id: company?.id ?? 0, name: company?.name ?? "", country: company?.country }, contacts: [contact], scope: "contact" });
  return (
    <>
      <Head title={contact.name} eyebrow={<><Link href="/crm/contacts">← Contacts</Link> · <ClientLink client={contact.client} /></>} />
      <Flash search={search} />
      <section className="crm-facts">
        <div><span>Fonction</span><strong>{contact.jobTitle || "—"}</strong></div>
        <div><span>Téléphone</span><strong>{contact.phone ? <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}>{contact.phone}</a> : "—"}</strong></div>
        <div><span>Email</span><strong>{contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : "—"}</strong></div>
      </section>
      <WhatsAppButton candidates={wa} mode={waMode(wa)} />
      <div className="crm-cols crm-cols--wide">
        <div className="crm-stack">
          <section className="crm-card"><h2>Activités</h2><Timeline activities={activities.docs} back={back} /></section>
          <section className="crm-card"><h2>Opportunités</h2><DealRows deals={deals.docs} /></section>
          {company && <MailSection clientId={company.id} contactId={id} to={contact.email} />}
        </div>
        <div className="crm-stack">
          <section className="crm-card" id="modifier" tabIndex={-1}>
            <h2>Modifier</h2>
            <ContactForm contact={contact} back={back} />
          </section>
          <form action={deleteContact} className="crm-danger">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="back" value={`/crm/clients/${relationID(contact.client)}`} />
            <Submit className="crm-btn crm-btn--danger" confirm={`Supprimer le contact ${contact.name} ?`}>Supprimer le contact</Submit>
          </form>
        </div>
      </div>
    </>
  );
}
