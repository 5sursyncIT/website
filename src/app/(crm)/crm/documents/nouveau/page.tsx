import Link from "next/link";
import { as, crmContext } from "@/lib/crm-server";
import { DocumentForm, Flash, Head, param } from "@/components/crm/parts";
export const metadata = { title: "Nouveau document" };
type Search = Promise<Record<string, string | string[] | undefined>>;
export default async function NewDocument({ searchParams }: { searchParams: Search }) {
  const search = await searchParams;
  const ctx = await crmContext();
  const kind = param(search, "type") === "facture" ? "invoice" : "quote";
  const client = Number(param(search, "entreprise")) || undefined;
  const deal = Number(param(search, "opportunite")) || undefined;
  const scoped = client ? { client: { equals: client } } : undefined;
  const [clients, contacts, deals] = await Promise.all([
    ctx.payload.find({ collection: "clients", where: { stage: { not_equals: "inactive" } }, sort: "name", pagination: false, depth: 0, select: { name: true }, ...as(ctx) }),
    ctx.payload.find({ collection: "crm-contacts", where: scoped, sort: "name", pagination: false, depth: 1, select: { name: true, client: true }, populate: { clients: { name: true } }, ...as(ctx) }),
    ctx.payload.find({ collection: "crm-deals", where: { and: [{ stage: { in: ["lead", "qualified", "proposal", "negotiation"] } }, ...(scoped ? [scoped] : [])] }, sort: "-updatedAt", pagination: false, depth: 0, select: { title: true }, ...as(ctx) }),
  ]);
  const back = `/crm/documents/nouveau?type=${kind === "invoice" ? "facture" : "devis"}${client ? `&entreprise=${client}` : ""}${deal ? `&opportunite=${deal}` : ""}`;
  return (
    <>
      <Head title={kind === "invoice" ? "Nouvelle facture" : "Nouveau devis"} eyebrow={<Link href="/crm/documents">← Devis et factures</Link>} />
      <Flash search={search} />
      <section className="crm-card">
        <p className="crm-hint">
          Le document est créé en brouillon, sans numéro. Le numéro ({kind === "invoice" ? "FAC" : "DEV"}-année-0001…) est attribué
          {kind === "invoice" ? " à l’émission ; une facture émise ne se modifie plus." : " à l’envoi du devis."}
          {!client && " Choisir l’entreprise depuis sa fiche pour ne proposer que ses contacts et opportunités."}
        </p>
        <DocumentForm kind={kind} clientID={client} dealID={deal} clients={clients.docs} contacts={contacts.docs} deals={deals.docs} back={back} />
      </section>
    </>
  );
}
