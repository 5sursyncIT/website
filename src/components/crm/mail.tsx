import Link from "next/link";
import { formatDateTime } from "@/lib/crm-server";
import { canMail } from "@/lib/mail/access";
import { mailContext, mailUnavailable } from "@/lib/mail/crm";
import { statesFor } from "@/lib/mail/rules";
import { history, mailboxAddress } from "@/lib/mail/service";
import type { DraftRow, MessageRow } from "@/lib/mail/store";
// Mailbox building blocks for the /crm pages. Metadata only: bodies are read from the
// mailbox (Microsoft or the Simafri IMAP server) when a message is opened.

export function DraftBadge({ state, provider }: { state: string; provider?: string | null }) {
  const s = statesFor(provider)[state];
  return <span className={`crm-badge crm-badge--${s?.tone ?? "info"}`} title={s?.hint}>{s?.label ?? state}</span>;
}
export const folderLabel = (folder: string) => (folder === "inbox" ? "Reçu" : "Envoyé");
export function MessageRows({ messages, empty = "Aucun email." }: { messages: MessageRow[]; empty?: string }) {
  if (!messages.length) return <p className="crm-empty">{empty}</p>;
  return (
    <ul className="crm-list crm-mail-list">
      {messages.map((m) => (
        <li key={m.id} className={m.removed_at ? "is-removed" : undefined}>
          <span>
            <span className={`crm-badge crm-badge--${m.folder === "inbox" ? "info" : "ok"}`}>{folderLabel(m.folder)}</span>{" "}
            {m.is_ndr && <span className="crm-badge crm-badge--off">Échec de livraison</span>}{" "}
            <Link href={`/crm/messagerie/${m.id}`}>{m.subject || "(sans objet)"}</Link>
          </span>
          <small>
            {m.folder === "inbox" ? `De ${m.from_name || m.from_address || "?"}` : `À ${m.to_addresses.join(", ") || "?"}`}
            {" · "}{formatDateTime(m.received_at ?? m.sent_at)}
            {m.has_attachments && " · pièce jointe"}
            {m.removed_at && " · supprimé ou déplacé dans la messagerie"}
          </small>
        </li>
      ))}
    </ul>
  );
}
export function DraftRows({ drafts }: { drafts: DraftRow[] }) {
  if (!drafts.length) return null;
  return (
    <ul className="crm-list crm-mail-list">
      {drafts.map((d) => (
        <li key={d.id}>
          <span><DraftBadge state={d.state} provider={d.provider} /> <Link href={`/crm/messagerie/brouillons/${d.id}`}>{d.subject || "(sans objet)"}</Link></span>
          <small>
            À {d.to_addresses.join(", ") || "?"} · modifié le {formatDateTime(d.updated_at)}
            {d.submitted_at && d.state === "draft" && " · à valider"}
            {d.delivery_failed_at && " · échec de livraison signalé"}
            {d.sent_copy === "failed" && " · copie dans Envoyés à refaire"}
            {d.attachments?.length > 0 && ` · ${d.attachments.length} pièce(s) jointe(s)`}
          </small>
        </li>
      ))}
    </ul>
  );
}
// "Emails" card of a company or contact page.
export async function MailSection({ clientId, contactId, to }: { clientId: number; contactId?: number; to?: string | null }) {
  const { deps, actor, reason } = await mailContext();
  const body = !deps ? (
    <p className="crm-hint">{mailUnavailable[reason ?? "disabled"]}</p>
  ) : !canMail({ mailAccess: actor.level }, "read") ? (
    <p className="crm-hint">Votre compte n’a pas accès à la messagerie du CRM.</p>
  ) : (
    await (async () => {
      const { messages, drafts } = await history(deps, actor, contactId ? { contactId } : { clientId });
      const params = new URLSearchParams({ entreprise: String(clientId), ...(contactId ? { contact: String(contactId) } : {}), ...(to ? { a: to } : {}) });
      return (
        <>
          {canMail({ mailAccess: actor.level }, "draft") && (
            <div className="crm-row-actions"><Link className="crm-btn crm-btn--small" href={`/crm/messagerie/nouveau?${params}`}>+ Nouveau mail (brouillon)</Link></div>
          )}
          {drafts.length > 0 && <><h3>Brouillons et envois</h3><DraftRows drafts={drafts} /></>}
          <h3>Échanges</h3>
          <MessageRows messages={messages} empty="Aucun email rattaché pour l’instant." />
        </>
      );
    })()
  );
  return (
    <section className="crm-card">
      <h2>Emails {deps ? mailboxAddress(deps) : "contact@"}</h2>
      {body}
    </section>
  );
}
