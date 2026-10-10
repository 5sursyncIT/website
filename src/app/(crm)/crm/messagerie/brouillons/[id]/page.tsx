import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateTime } from "@/lib/crm-server";
import { canMail } from "@/lib/mail/access";
import { mailContext, mailUnavailable } from "@/lib/mail/crm";
import { ndrKindLabel, statesFor } from "@/lib/mail/rules";
import { isImap, mailboxAddress, readDraft } from "@/lib/mail/service";
import { ATTACHMENT_LIMITS } from "@/lib/mail/mime";
import { Submit } from "@/components/crm/client";
import { DraftBadge } from "@/components/crm/mail";
import { Flash, Head } from "@/components/crm/parts";
import { abandonDraft, checkDraft, copyToSent, declareNotSent, saveDraft, sendDraft, submitForReview } from "../../actions";
export const metadata = { title: "Brouillon" };
type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
const actions: Record<string, string> = {
  prepare: "préparé", edit: "modifié", submit: "signalé pour validation", "send-request": "envoi demandé",
  "send-accepted": "accepté par Microsoft", "send-failed": "refusé par Microsoft", "send-uncertain": "résultat incertain",
  "in-sent": "présent dans les Éléments envoyés", "verified-not-sent": "vérifié : non envoyé, remis en brouillon", discard: "abandonné",
  "sent-copy-saved": "copie enregistrée dans Envoyés", "sent-copy-failed": "copie dans Envoyés impossible (message accepté, non renvoyé)",
  "draft-removed": "brouillon retiré du dossier Brouillons après envoi", "confirmed-not-sent": "déclaré non parti par une personne, remis en brouillon",
};
const imapActions: Record<string, string> = {
  ...actions, "send-accepted": "accepté par le serveur SMTP", "send-failed": "refusé par le serveur SMTP", "in-sent": "trouvé dans Envoyés",
};
export default async function DraftPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ id: raw }, search] = await Promise.all([params, searchParams]);
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const { deps, actor, reason } = await mailContext();
  if (!deps) return <><Head title="Brouillon" /><p className="crm-empty">{mailUnavailable[reason ?? "disabled"]}</p></>;
  if (!canMail({ mailAccess: actor.level }, "read")) notFound();
  const draft = await readDraft(deps, actor, id);
  if (!draft) notFound();
  const { row } = draft;
  const imap = isImap(deps);
  const states = statesFor(row.provider);
  const elsewhere = imap ? "le webmail ou Outlook" : "Outlook";
  const sender = imap ? `${deps.imap.config.displayName} <${mailboxAddress(deps)}>` : mailboxAddress(deps);
  const otherProvider = (row.provider ?? "graph") !== (imap ? "imap" : "graph");
  const events = await deps.store.draftEvents(id);
  const back = `/crm/messagerie/brouillons/${id}`;
  const canDraft = canMail({ mailAccess: actor.level }, "draft");
  const canSend = canMail({ mailAccess: actor.level }, "send");
  const editable = row.state === "draft" && canDraft && !draft.outlookEdited && !draft.missing && draft.text !== null && !otherProvider;
  const hidden = <><input type="hidden" name="id" value={id} /><input type="hidden" name="back" value={back} /></>;
  return (
    <>
      <Head title={row.subject || "(sans objet)"} eyebrow={<>{row.client_id ? <Link href={`/crm/clients/${row.client_id}`}>← Fiche entreprise</Link> : <Link href="/crm/messagerie">← Messagerie</Link>} · {row.kind === "reply" ? "Réponse dans le fil" : "Nouveau message"}</>}>
        <DraftBadge state={row.state} provider={row.provider} />
      </Head>
      <Flash search={search} />
      <p className="crm-hint">{states[row.state]?.hint}</p>
      {otherProvider && <p className="crm-flash crm-flash--error">Brouillon créé avec {row.provider === "imap" ? "la messagerie Simafri" : "l’ancienne messagerie Microsoft 365"} : consultation seulement, il ne peut pas partir par la messagerie actuelle.</p>}
      {row.delivery_failed_at && <p className="crm-flash crm-flash--error">Échec de livraison signalé le {formatDateTime(row.delivery_failed_at)} pour {row.delivery_failed_for.join(", ")}{row.delivery_failure_kind ? ` (${ndrKindLabel[row.delivery_failure_kind] ?? row.delivery_failure_kind})` : ""}. Aucune relance automatique.</p>}
      {row.sent_copy === "failed" && <p className="crm-flash crm-flash--error">Le serveur SMTP a accepté ce message, mais sa copie n’a pas pu être enregistrée dans Envoyés. Le message n’est pas renvoyé.</p>}
      {draft.outlookEdited && <p className="crm-flash crm-flash--error">Ce brouillon a été modifié dans {elsewhere} : le CRM ne l’écrase pas. Terminez-le et envoyez-le depuis {elsewhere}.</p>}
      {draft.missing && row.state === "draft" && !otherProvider && <p className="crm-flash crm-flash--error">Ce brouillon n’est plus dans les Brouillons de {mailboxAddress(deps)} (envoyé ou supprimé dans {elsewhere}). Utilisez « Vérifier l’état ».</p>}
      <div className="crm-cols crm-cols--wide">
        <div className="crm-stack">
          <section className="crm-card">
            <h2>{editable ? "Modifier" : "Contenu"}</h2>
            {editable ? (
              <form action={saveDraft} className="crm-form">
                {hidden}
                <div className="crm-grid">
                  <label className="crm-span-all">Expéditeur<input value={sender} readOnly disabled /></label>
                  <label className="crm-span-all">À *<input name="to" required maxLength={500} defaultValue={row.to_addresses.join(", ")} /></label>
                  <label className="crm-span-all">Cc<input name="cc" maxLength={500} defaultValue={row.cc_addresses.join(", ")} /></label>
                  <label className="crm-span-all">Objet *<input name="subject" required maxLength={300} defaultValue={row.subject} /></label>
                  <label className="crm-span-all">Message *<textarea name="text" rows={12} maxLength={20000} required defaultValue={draft.text ?? ""} /></label>
                  {imap && row.attachments.length > 0 && (
                    <fieldset className="crm-span-all">
                      <legend>Pièces jointes du brouillon</legend>
                      {row.attachments.map((a) => (
                        <label key={a.name} className="crm-check"><input type="checkbox" name="remove" value={a.name} /> Retirer {a.name} ({Math.ceil(a.size / 1024)} Ko)</label>
                      ))}
                    </fieldset>
                  )}
                  {imap && <label className="crm-span-all">Ajouter des pièces jointes ({ATTACHMENT_LIMITS.count} au plus, 4 Mo au total)<input type="file" name="files" multiple /></label>}
                </div>
                <p className="crm-hint">Signature ajoutée une seule fois{row.kind === "reply" ? ", suivie de la citation du message d’origine" : ""}. Enregistrer n’envoie rien.</p>
                <Submit>Enregistrer le brouillon</Submit>
              </form>
            ) : (
              <ul className="crm-list">
                <li><span>À : {row.to_addresses.join(", ") || "—"}</span></li>
                {row.cc_addresses.length > 0 && <li><span>Cc : {row.cc_addresses.join(", ")}</span></li>}
                {row.attachments.length > 0 && <li><span>Pièces jointes : {row.attachments.map((a) => a.name).join(", ")}</span></li>}
                {draft.text !== null && <li><p className="crm-pre crm-mail-body">{draft.text}</p></li>}
              </ul>
            )}
          </section>
        </div>
        <div className="crm-stack">
          {row.state === "draft" && canDraft && !draft.missing && !otherProvider && (
            <section className="crm-card">
              <h2>Validation et envoi</h2>
              {!row.submitted_at && (
                <form action={submitForReview} className="crm-row-actions">{hidden}<Submit className="crm-btn crm-btn--ghost">Signaler pour validation</Submit></form>
              )}
              {row.submitted_at && <p className="crm-hint">Signalé pour validation le {formatDateTime(row.submitted_at)}.</p>}
              {canSend ? (
                !draft.outlookEdited && (
                  <form action={sendDraft} className="crm-form crm-send">
                    {hidden}
                    <p>Expéditeur <strong>{sender}</strong> · À <strong>{row.to_addresses.join(", ")}</strong>{row.cc_addresses.length > 0 && <> · Cc {row.cc_addresses.join(", ")}</>}<br />Objet : <strong>{row.subject}</strong>
                      {row.attachments.length > 0 && <><br />Pièces jointes : {row.attachments.map((a) => a.name).join(", ")}</>}</p>
                    <label className="crm-check"><input type="checkbox" name="confirm" value="oui" required /> J’ai relu ce message et je confirme l’envoi depuis {mailboxAddress(deps)}.</label>
                    <Submit className="crm-btn" confirm={`Envoyer maintenant à ${row.to_addresses.join(", ")} ?`}>Envoyer</Submit>
                  </form>
                )
              ) : (
                <p className="crm-hint">L’envoi est réservé aux administrateurs autorisés.</p>
              )}
              <form action={abandonDraft} className="crm-row-actions">{hidden}<Submit className="crm-btn crm-btn--small crm-btn--danger" confirm={`Abandonner ce brouillon ? Il sera supprimé des Brouillons de ${mailboxAddress(deps)}.`}>Abandonner</Submit></form>
            </section>
          )}
          {["accepted", "uncertain", "failed", "sending"].includes(row.state) && !otherProvider && (
            <section className="crm-card">
              <h2>Vérifier l’état</h2>
              <p className="crm-hint">Lecture seule : recherche dans les dossiers Envoyés et Brouillons de {mailboxAddress(deps)}. Aucun envoi n’est relancé.</p>
              <form action={checkDraft}>{hidden}<Submit className="crm-btn crm-btn--ghost">Vérifier l’état</Submit></form>
              {imap && canSend && row.state === "accepted" && row.sent_copy === "failed" && (
                <form action={copyToSent} className="crm-row-actions">{hidden}<Submit className="crm-btn crm-btn--small crm-btn--ghost">Enregistrer la copie dans Envoyés</Submit></form>
              )}
              {imap && canSend && row.state === "uncertain" && (
                <form action={declareNotSent} className="crm-form">
                  {hidden}
                  <p className="crm-hint">La connexion au serveur SMTP a été coupée pendant l’envoi : le message a pu partir. Ne le déclarez non parti qu’après vérification (destinataire, webmail).</p>
                  <label className="crm-check"><input type="checkbox" name="confirm" value="oui" required /> J’ai vérifié : ce message n’est pas parti.</label>
                  <Submit className="crm-btn crm-btn--small crm-btn--ghost" confirm="Remettre en brouillon ? Rien ne sera envoyé maintenant.">Déclarer non parti</Submit>
                </form>
              )}
            </section>
          )}
          <section className="crm-card">
            <h2>Journal</h2>
            <ul className="crm-list">
              {events.map((e, i) => (
                <li key={i}><span>{(row.provider === "imap" ? imapActions : actions)[e.action] ?? e.action}</span><small>{formatDateTime(e.at)} · {e.admin ?? (e.channel === "sync" ? "synchronisation" : "—")}{e.channel === "charlie" ? " (Charlie)" : ""}</small></li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
