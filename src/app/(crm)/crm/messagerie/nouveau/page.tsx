import Link from "next/link";
import { notFound } from "next/navigation";
import { as } from "@/lib/crm-server";
import { canMail } from "@/lib/mail/access";
import { mailContext, mailUnavailable } from "@/lib/mail/crm";
import { Submit } from "@/components/crm/client";
import { Flash, Head } from "@/components/crm/parts";
import { newDraft } from "../actions";
export const metadata = { title: "Nouveau mail" };
type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: unknown) => (typeof v === "string" ? v : "");
export default async function NewMailPage({ searchParams }: { searchParams: Search }) {
  const search = await searchParams;
  const { deps, actor, reason, ctx } = await mailContext();
  if (!deps) return <><Head title="Nouveau mail" /><p className="crm-empty">{mailUnavailable[reason ?? "disabled"]}</p></>;
  if (!canMail({ mailAccess: actor.level }, "draft")) notFound();
  const clientId = Number(one(search.entreprise)) || null;
  const contactId = Number(one(search.contact)) || null;
  const [client, contacts] = clientId
    ? await Promise.all([
        ctx.payload.findByID({ collection: "clients", id: clientId, depth: 0, disableErrors: true, ...as(ctx) }),
        ctx.payload.find({ collection: "crm-contacts", where: { client: { equals: clientId } }, sort: "-primary,name", pagination: false, depth: 0, ...as(ctx) }),
      ])
    : [null, null];
  const contact = contacts?.docs.find((c) => c.id === contactId);
  const to = one(search.a) || contact?.email || client?.email || "";
  const back = `/crm/messagerie/nouveau?${new URLSearchParams(Object.entries(search).filter(([k, v]) => typeof v === "string" && !["ok", "erreur"].includes(k)) as [string, string][])}`;
  return (
    <>
      <Head title="Nouveau mail" eyebrow={client ? <Link href={`/crm/clients/${client.id}`}>← {client.name}</Link> : <Link href="/crm/messagerie">← Messagerie</Link>} />
      <Flash search={search} />
      <section className="crm-card">
        <form action={newDraft} className="crm-form">
          <input type="hidden" name="back" value={back} />
          {client && <input type="hidden" name="client" value={client.id} />}
          <div className="crm-grid">
            <label className="crm-span-all">Expéditeur<input value="contact@5sursync.com (boîte partagée)" readOnly disabled /></label>
            {contacts && contacts.docs.length > 0 && (
              <label className="crm-span-all">Contact
                <select name="contact" defaultValue={contactId ?? ""}>
                  <option value="">Aucun (entreprise seulement)</option>
                  {contacts.docs.map((c) => <option key={c.id} value={c.id}>{c.name}{c.email ? ` — ${c.email}` : ""}</option>)}
                </select>
              </label>
            )}
            <label className="crm-span-all">À *<input name="to" required maxLength={500} defaultValue={to} placeholder="adresse@exemple.sn" /></label>
            <label className="crm-span-all">Cc<input name="cc" maxLength={500} /></label>
            <label className="crm-span-all">Objet *<input name="subject" required maxLength={300} /></label>
            <label className="crm-span-all">Message *<textarea name="text" rows={12} maxLength={20000} required /></label>
          </div>
          <p className="crm-hint">La signature validée de contact@ (logo à droite) est ajoutée une seule fois. Le mail est enregistré dans les Brouillons de contact@ : rien n’est envoyé.</p>
          <Submit>Enregistrer le brouillon</Submit>
        </form>
      </section>
    </>
  );
}
