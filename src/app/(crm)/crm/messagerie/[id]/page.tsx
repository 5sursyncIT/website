import Link from "next/link";
import { notFound } from "next/navigation";
import { as, formatDateTime } from "@/lib/crm-server";
import { canMail } from "@/lib/mail/access";
import { mailContext, mailUnavailable } from "@/lib/mail/crm";
import { companyDomain, ndrKindLabel } from "@/lib/mail/rules";
import { isImap, readMessage } from "@/lib/mail/service";
import { ATTACHMENT_LIMITS } from "@/lib/mail/mime";
import { Submit } from "@/components/crm/client";
import { folderLabel, MessageRows } from "@/components/crm/mail";
import { ClientLink, Flash, Head } from "@/components/crm/parts";
import { assignMessage, recordActivity, replyDraft, unassignMessage } from "../actions";
export const metadata = { title: "Email" };
type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
export default async function MessagePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ id: raw }, search] = await Promise.all([params, searchParams]);
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const { deps, actor, reason, ctx } = await mailContext();
  if (!deps) return <><Head title="Email" /><p className="crm-empty">{mailUnavailable[reason ?? "disabled"]}</p></>;
  if (!canMail({ mailAccess: actor.level }, "read")) notFound();
  const message = await readMessage(deps, actor, id, "text").catch(() => null);
  const row = message?.row ?? (await deps.store.message(id));
  if (!row) notFound();
  const back = `/crm/messagerie/${id}`;
  const canDraft = canMail({ mailAccess: actor.level }, "draft");
  const imap = isImap(deps);
  const counterpart = row.folder === "inbox" ? row.from_address ?? "" : row.to_addresses[0] ?? "";
  const [suggested, thread, clients, contacts] = await Promise.all([
    deps.store.domainSuggestions(companyDomain(counterpart)),
    deps.store.thread(row.conversation_id),
    canDraft ? ctx.payload.find({ collection: "clients", sort: "name", limit: 500, depth: 0, select: { name: true }, ...as(ctx) }) : null,
    canDraft && row.client_id ? ctx.payload.find({ collection: "crm-contacts", where: { client: { equals: row.client_id } }, sort: "name", pagination: false, depth: 0, select: { name: true }, ...as(ctx) }) : null,
  ]);
  return (
    <>
      <Head title={row.subject || "(sans objet)"} eyebrow={<><Link href="/crm/messagerie">← Messagerie</Link> · {folderLabel(row.folder)}</>} />
      <Flash search={search} />
      <section className="crm-facts">
        <div><span>De</span><strong>{row.from_name ? `${row.from_name} <${row.from_address}>` : row.from_address ?? "—"}</strong></div>
        <div><span>À</span><strong>{row.to_addresses.join(", ") || "—"}</strong>{row.cc_addresses.length > 0 && <small>Cc {row.cc_addresses.join(", ")}</small>}</div>
        <div><span>Date</span><strong>{formatDateTime(row.received_at ?? row.sent_at)}</strong></div>
        <div><span>Fiche</span><strong>{row.client_id ? <ClientLink client={{ id: row.client_id, name: clients?.docs.find((c) => c.id === row.client_id)?.name }} /> : "Non rattaché"}</strong>
          <small>{row.link_method === "auto" ? "rattachement automatique (adresse exacte)" : row.link_method === "manual" ? "rattachement manuel" : row.link_method === "draft" ? "envoyé depuis le CRM" : row.link_state === "ambiguous" ? "plusieurs fiches possibles" : ""}</small></div>
      </section>
      {row.is_ndr && (
        <p className="crm-flash crm-flash--error">
          Rapport de non-remise{row.ndr_recipients.length ? ` pour ${row.ndr_recipients.join(", ")}` : " (destinataire non identifié)"}
          {row.ndr_kind ? ` : ${ndrKindLabel[row.ndr_kind] ?? row.ndr_kind}` : ""}
          {row.ndr_kind === "address" ? ". Adresse bloquée pour l’envoi." : row.ndr_recipients.length ? ". Adresse non bloquée." : "."}
        </p>
      )}
      {!row.client_id && canDraft && (() => {
        // A reply to a message already attributed: a hint only, never an automatic link.
        const linked = thread.find((t) => t.id !== row.id && t.client_id);
        return linked ? <p className="crm-hint">Ce fil contient un message rattaché à <ClientLink client={{ id: linked.client_id!, name: clients?.docs.find((c) => c.id === linked.client_id)?.name }} />. À vérifier avant de rattacher.</p> : null;
      })()}
      <div className="crm-cols crm-cols--wide">
        <div className="crm-stack">
          <section className="crm-card">
            <h2>Message</h2>
            {message ? (
              <>
                <p className="crm-pre crm-mail-body">{message.body || "(message vide)"}</p>
                <p className="crm-hint">Texte brut fourni par la messagerie (lu sans marquer le message comme lu). <a href={`/crm/messagerie/${id}/html`} target="_blank" rel="noopener noreferrer">Version mise en forme (onglet isolé, sans script ni image distante) ↗</a></p>
                {message.attachments.length > 0 && (
                  <>
                    <h3>Pièces jointes</h3>
                    <ul className="crm-list">
                      {message.attachments.map((a) => (
                        <li key={a.id}><a href={`/crm/messagerie/${id}/pieces/${encodeURIComponent(a.id)}`}>{a.name}</a><small>{a.contentType} · {Math.ceil(a.size / 1024)} Ko · téléchargement</small></li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            ) : (
              <p className="crm-empty">Contenu indisponible : message supprimé ou déplacé dans Outlook, ou Microsoft injoignable.</p>
            )}
          </section>
          {canDraft && message && (
            <section className="crm-card">
              <h2>Répondre dans ce fil</h2>
              <form action={replyDraft} className="crm-form">
                <input type="hidden" name="message" value={id} />
                <input type="hidden" name="back" value={back} />
                <div className="crm-grid">
                  <label className="crm-span-all">Votre réponse<textarea name="text" rows={8} maxLength={20000} required /></label>
                  {imap && <label className="crm-span-all">Pièces jointes ({ATTACHMENT_LIMITS.count} au plus, 4 Mo au total)<input type="file" name="files" multiple /></label>}
                </div>
                <p className="crm-hint">La réponse est créée en brouillon dans la boîte, dans le même fil (In-Reply-To, References), avec la signature et la citation du message. Rien n’est envoyé.</p>
                <Submit>Préparer la réponse</Submit>
              </form>
            </section>
          )}
          {thread.length > 1 && <section className="crm-card"><h2>Fil de discussion</h2><MessageRows messages={thread} /></section>}
        </div>
        <div className="crm-stack">
          {canDraft && (
            <section className="crm-card">
              <h2>Rattachement</h2>
              {suggested.length > 0 && !row.client_id && (
                <p className="crm-hint">Même domaine que : {suggested.map((s, i) => <span key={s.id}>{i > 0 && ", "}<Link href={`/crm/clients/${s.id}`}>{s.name}</Link></span>)}. À vérifier : ce n’est qu’une piste.</p>
              )}
              <form action={assignMessage} className="crm-form">
                <input type="hidden" name="message" value={id} />
                <input type="hidden" name="back" value={back} />
                <div className="crm-grid">
                  <label className="crm-span-all">Entreprise
                    <select name="client" defaultValue={row.client_id ?? ""} required>
                      <option value="">Choisir…</option>
                      {clients?.docs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                  {contacts && (
                    <label className="crm-span-all">Contact (de cette entreprise)
                      <select name="contact" defaultValue={row.contact_id ?? ""}>
                        <option value="">Aucun</option>
                        {contacts.docs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                <Submit>{row.client_id ? "Modifier le rattachement" : "Rattacher"}</Submit>
              </form>
              {row.client_id && (
                <>
                  <form action={unassignMessage} className="crm-row-actions">
                    <input type="hidden" name="message" value={id} />
                    <input type="hidden" name="back" value={back} />
                    <Submit className="crm-btn crm-btn--small crm-btn--ghost">Retirer le rattachement</Submit>
                  </form>
                  <form action={recordActivity} className="crm-row-actions">
                    <input type="hidden" name="message" value={id} />
                    <input type="hidden" name="client" value={row.client_id} />
                    <input type="hidden" name="contact" value={row.contact_id ?? ""} />
                    <input type="hidden" name="subject" value={`${folderLabel(row.folder)} : ${row.subject}`.slice(0, 200)} />
                    <input type="hidden" name="back" value={back} />
                    <Submit className="crm-btn crm-btn--small crm-btn--ghost">Enregistrer une activité « Email »</Submit>
                  </form>
                </>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
