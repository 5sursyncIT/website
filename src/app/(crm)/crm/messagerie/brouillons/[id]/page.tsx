import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateTime } from "@/lib/crm-server";
import { canMail } from "@/lib/mail/access";
import { mailContext, mailUnavailable } from "@/lib/mail/crm";
import { draftStates } from "@/lib/mail/rules";
import { readDraft } from "@/lib/mail/service";
import { Submit } from "@/components/crm/client";
import { DraftBadge } from "@/components/crm/mail";
import { Flash, Head } from "@/components/crm/parts";
import { abandonDraft, checkDraft, saveDraft, sendDraft, submitForReview } from "../../actions";
export const metadata = { title: "Brouillon" };
type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
const actions: Record<string, string> = {
  prepare: "préparé", edit: "modifié", submit: "signalé pour validation", "send-request": "envoi demandé",
  "send-accepted": "accepté par Microsoft", "send-failed": "refusé par Microsoft", "send-uncertain": "résultat incertain",
  "in-sent": "présent dans les Éléments envoyés", "verified-not-sent": "vérifié : non envoyé, remis en brouillon", discard: "abandonné",
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
  const events = await deps.store.draftEvents(id);
  const back = `/crm/messagerie/brouillons/${id}`;
  const canDraft = canMail({ mailAccess: actor.level }, "draft");
  const canSend = canMail({ mailAccess: actor.level }, "send");
  const editable = row.state === "draft" && canDraft && !draft.outlookEdited && !draft.missing && draft.text !== null;
  const hidden = <><input type="hidden" name="id" value={id} /><input type="hidden" name="back" value={back} /></>;
  return (
    <>
      <Head title={row.subject || "(sans objet)"} eyebrow={<>{row.client_id ? <Link href={`/crm/clients/${row.client_id}`}>← Fiche entreprise</Link> : <Link href="/crm/messagerie">← Messagerie</Link>} · {row.kind === "reply" ? "Réponse dans le fil" : "Nouveau message"}</>}>
        <DraftBadge state={row.state} />
      </Head>
      <Flash search={search} />
      <p className="crm-hint">{draftStates[row.state]?.hint}</p>
      {row.delivery_failed_at && <p className="crm-flash crm-flash--error">Échec de livraison signalé le {formatDateTime(row.delivery_failed_at)} pour {row.delivery_failed_for.join(", ")}. Aucune relance automatique.</p>}
      {draft.outlookEdited && <p className="crm-flash crm-flash--error">Ce brouillon a été modifié dans Outlook : le CRM ne l’écrase pas. Terminez-le et envoyez-le depuis Outlook.</p>}
      {draft.missing && row.state === "draft" && <p className="crm-flash crm-flash--error">Ce brouillon n’est plus dans les Brouillons de contact@ (envoyé ou supprimé dans Outlook). Utilisez « Vérifier l’état ».</p>}
      <div className="crm-cols crm-cols--wide">
        <div className="crm-stack">
          <section className="crm-card">
            <h2>{editable ? "Modifier" : "Contenu"}</h2>
            {editable ? (
              <form action={saveDraft} className="crm-form">
                {hidden}
                <div className="crm-grid">
                  <label className="crm-span-all">Expéditeur<input value="contact@5sursync.com (boîte partagée)" readOnly disabled /></label>
                  <label className="crm-span-all">À *<input name="to" required maxLength={500} defaultValue={row.to_addresses.join(", ")} /></label>
                  <label className="crm-span-all">Cc<input name="cc" maxLength={500} defaultValue={row.cc_addresses.join(", ")} /></label>
                  <label className="crm-span-all">Objet *<input name="subject" required maxLength={300} defaultValue={row.subject} /></label>
                  <label className="crm-span-all">Message *<textarea name="text" rows={12} maxLength={20000} required defaultValue={draft.text ?? ""} /></label>
                </div>
                <p className="crm-hint">Signature ajoutée une seule fois{row.kind === "reply" ? ", suivie de la citation du message d’origine" : ""}. Enregistrer n’envoie rien.</p>
                <Submit>Enregistrer le brouillon</Submit>
              </form>
            ) : (
              <ul className="crm-list">
                <li><span>À : {row.to_addresses.join(", ") || "—"}</span></li>
                {row.cc_addresses.length > 0 && <li><span>Cc : {row.cc_addresses.join(", ")}</span></li>}
                {draft.text !== null && <li><p className="crm-pre crm-mail-body">{draft.text}</p></li>}
              </ul>
            )}
          </section>
        </div>
        <div className="crm-stack">
          {row.state === "draft" && canDraft && !draft.missing && (
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
                    <p>Expéditeur <strong>contact@5sursync.com</strong> · À <strong>{row.to_addresses.join(", ")}</strong>{row.cc_addresses.length > 0 && <> · Cc {row.cc_addresses.join(", ")}</>}<br />Objet : <strong>{row.subject}</strong></p>
                    <label className="crm-check"><input type="checkbox" name="confirm" value="oui" required /> J’ai relu ce message et je confirme l’envoi depuis contact@.</label>
                    <Submit className="crm-btn" confirm={`Envoyer maintenant à ${row.to_addresses.join(", ")} ?`}>Envoyer</Submit>
                  </form>
                )
              ) : (
                <p className="crm-hint">L’envoi est réservé aux administrateurs autorisés.</p>
              )}
              <form action={abandonDraft} className="crm-row-actions">{hidden}<Submit className="crm-btn crm-btn--small crm-btn--danger" confirm="Abandonner ce brouillon ? Il sera supprimé des Brouillons de contact@.">Abandonner</Submit></form>
            </section>
          )}
          {["accepted", "uncertain", "failed", "sending"].includes(row.state) && (
            <section className="crm-card">
              <h2>Vérifier l’état</h2>
              <p className="crm-hint">Lecture seule : recherche dans les Éléments envoyés et les Brouillons de contact@. Aucun envoi n’est relancé.</p>
              <form action={checkDraft}>{hidden}<Submit className="crm-btn crm-btn--ghost">Vérifier l’état</Submit></form>
            </section>
          )}
          <section className="crm-card">
            <h2>Journal</h2>
            <ul className="crm-list">
              {events.map((e, i) => (
                <li key={i}><span>{actions[e.action] ?? e.action}</span><small>{formatDateTime(e.at)} · {e.admin ?? (e.channel === "sync" ? "synchronisation" : "—")}{e.channel === "charlie" ? " (Charlie)" : ""}</small></li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
