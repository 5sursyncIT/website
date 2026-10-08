"use server";
import { redirect, unstable_rethrow } from "next/navigation";
import { safeBack, withMessage } from "@/lib/crm-server";
import { mailContext } from "@/lib/mail/crm";
import { GraphError, GraphUncertain } from "@/lib/mail/graph";
import { draftStateLabel } from "@/lib/mail/rules";
import { canMail } from "@/lib/mail/access";
import { syncAll } from "@/lib/mail/sync";
import {
  MailRefused, assign, discardDraft, liftSuppression, logActivity, prepareDraft, prepareReply,
  sendAuthorizedDraft, submitDraft, unassign, updateDraft, verifyDraft, type MailDeps,
} from "@/lib/mail/service";
// Mailbox actions behind plain forms. Each one re-checks the session and the mailbox
// right (inside the service). Saving a draft never sends: only sendDraft calls Microsoft's
// send, with the separate "send" credential.
type Ctx = Awaited<ReturnType<typeof mailContext>>;
const str = (data: FormData, key: string) => String(data.get(key) ?? "");
const num = (data: FormData, key: string) => {
  const n = Number(data.get(key));
  return Number.isInteger(n) && n > 0 ? n : null;
};
// work returns the destination path, or { message } to replace the default success text.
type Outcome = string | void | { path?: string; message: string };
async function run(data: FormData, fallback: string, work: (c: Ctx & { deps: MailDeps }) => Promise<Outcome>, ok: string) {
  const c = await mailContext();
  const back = safeBack(data.get("back"), fallback);
  let destination: string;
  try {
    if (!c.deps) throw new MailRefused("Messagerie indisponible sur cette instance.");
    const outcome = await work({ ...c, deps: c.deps });
    const path = typeof outcome === "string" ? outcome : outcome?.path || back;
    destination = withMessage(path || back, "ok", typeof outcome === "object" && outcome ? outcome.message : ok);
  } catch (error) {
    unstable_rethrow(error);
    const message = error instanceof MailRefused
      ? error.message
      : error instanceof GraphError
        ? error.status === 403 || error.status === 401
          ? "Microsoft refuse l’accès (droits de l’application à vérifier)."
          : error.status === 404 ? "Élément introuvable dans contact@ (supprimé ou déplacé dans Outlook ?)." : "Microsoft a refusé la demande."
        : error instanceof GraphUncertain
          ? "Microsoft ne répond pas pour le moment. Réessayez dans quelques minutes."
          : "L’opération a échoué. Réessayez.";
    if (!(error instanceof MailRefused)) console.error("crm-mail action", error instanceof Error ? error.message : "error");
    destination = withMessage(back, "erreur", message);
  }
  redirect(destination);
}

export async function newDraft(data: FormData) {
  await run(data, "/crm/messagerie", async ({ deps, actor }) => {
    const id = await prepareDraft(deps, actor, {
      clientId: num(data, "client"), contactId: num(data, "contact"),
      to: str(data, "to"), cc: str(data, "cc"), subject: str(data, "subject"), text: str(data, "text"),
    });
    return `/crm/messagerie/brouillons/${id}`;
  }, "Brouillon enregistré dans contact@. Rien n’a été envoyé.");
}
export async function replyDraft(data: FormData) {
  await run(data, "/crm/messagerie", async ({ deps, actor }) => {
    const id = await prepareReply(deps, actor, num(data, "message") ?? 0, str(data, "text"));
    return `/crm/messagerie/brouillons/${id}`;
  }, "Réponse préparée dans le fil, en brouillon. Rien n’a été envoyé.");
}
export async function saveDraft(data: FormData) {
  await run(data, "/crm/messagerie", async ({ deps, actor }) => {
    await updateDraft(deps, actor, num(data, "id") ?? 0, { to: str(data, "to"), cc: str(data, "cc"), subject: str(data, "subject"), text: str(data, "text") });
  }, "Brouillon enregistré. Rien n’a été envoyé.");
}
export async function submitForReview(data: FormData) {
  await run(data, "/crm/messagerie", async ({ deps, actor }) => {
    await submitDraft(deps, actor, num(data, "id") ?? 0);
  }, "Brouillon signalé pour validation.");
}
export async function sendDraft(data: FormData) {
  await run(data, "/crm/messagerie", async ({ deps, actor }) => {
    if (str(data, "confirm") !== "oui") throw new MailRefused("Cochez la confirmation d’envoi.");
    const state = await sendAuthorizedDraft(deps, actor, num(data, "id") ?? 0);
    return { message: `Envoi : ${draftStateLabel(state)}. Ce n’est pas une preuve de réception.` };
  }, "");
}
export async function checkDraft(data: FormData) {
  await run(data, "/crm/messagerie", async ({ deps, actor }) => {
    const state = await verifyDraft(deps, actor, num(data, "id") ?? 0);
    return { message: `État vérifié : ${draftStateLabel(state)}.` };
  }, "");
}
export async function abandonDraft(data: FormData) {
  await run(data, "/crm/messagerie", async ({ deps, actor }) => {
    await discardDraft(deps, actor, num(data, "id") ?? 0);
  }, "Brouillon abandonné.");
}
export async function assignMessage(data: FormData) {
  await run(data, "/crm/messagerie", async ({ deps, actor }) => {
    const client = num(data, "client");
    if (!client) throw new MailRefused("Choisissez une entreprise.");
    await assign(deps, actor, num(data, "message") ?? 0, client, num(data, "contact"));
  }, "Message rattaché.");
}
export async function unassignMessage(data: FormData) {
  await run(data, "/crm/messagerie", async ({ deps, actor }) => {
    await unassign(deps, actor, num(data, "message") ?? 0);
  }, "Rattachement retiré : le message est dans « À attribuer ».");
}
// Diagnostic and recovery: one synchronisation round now (same lease as the worker).
export async function syncNow(data: FormData) {
  await run(data, "/crm/messagerie?vue=etat", async ({ deps, actor }) => {
    if (!canMail({ mailAccess: actor.level }, "draft")) throw new MailRefused("Action non autorisée pour ce compte.");
    const r = await syncAll(deps.graph, deps.store);
    const parts = r.results.map((x) => `${x.folder === "inbox" ? "réception" : "envoyés"} : ${x.skipped ? "déjà en cours" : x.error ? `erreur ${x.error}` : x.reset ? "état Microsoft perdu, reprise relancée" : `${x.seen} nouveau(x) ou modifié(s)`}`);
    return { message: `Synchronisation : ${parts.join(" ; ")}.` };
  }, "");
}
export async function liftBlock(data: FormData) {
  await run(data, "/crm/messagerie?vue=etat", async ({ deps, actor }) => {
    await liftSuppression(deps, actor, str(data, "address"));
  }, "Blocage levé pour cette adresse.");
}
export async function recordActivity(data: FormData) {
  await run(data, "/crm/messagerie", async ({ ctx, actor }) => {
    const client = num(data, "client");
    if (!client) throw new MailRefused("Rattachez d’abord le message à une entreprise.");
    await logActivity(ctx.payload as never, ctx.user, actor, { clientId: client, contactId: num(data, "contact"), subject: str(data, "subject"), messageId: num(data, "message") });
  }, "Activité « Email » enregistrée sur la fiche.");
}
