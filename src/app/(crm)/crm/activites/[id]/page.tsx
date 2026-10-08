import Link from "next/link";
import { notFound } from "next/navigation";
import { as, crmContext, formatDateTime, safeBack } from "@/lib/crm-server";
import { activityKindLabel } from "@/lib/crm";
import { relationID } from "@/lib/access";
import { database } from "@/lib/database";
import { reminderStates } from "@/lib/crm-reminders";
import { deleteActivity } from "../../actions";
import { Submit } from "@/components/crm/client";
import { ActivityForm, ClientLink, Flash, Head, param } from "@/components/crm/parts";
export const metadata = { title: "Modifier l’activité" };
type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
const reminderText: Record<string, string> = {
  accepted: "Rappel email accepté par le serveur de messagerie pour l’échéance actuelle.",
  failed: "Le serveur de messagerie a refusé le rappel email pour l’échéance actuelle.",
  uncertain: "Envoi du rappel email incertain (interruption) : il ne sera pas renvoyé automatiquement.",
  dispatching: "Rappel email en cours d’envoi.",
};
export default async function ActivityPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ id: raw }, search] = await Promise.all([params, searchParams]);
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const ctx = await crmContext();
  const activity = await ctx.payload.findByID({ collection: "crm-activities", id, depth: 0, disableErrors: true, ...as(ctx) });
  if (!activity) notFound();
  const client = Number(relationID(activity.client));
  const [company, contacts, admins, states] = await Promise.all([
    ctx.payload.findByID({ collection: "clients", id: client, depth: 0, select: { name: true }, ...as(ctx) }),
    ctx.payload.find({ collection: "crm-contacts", where: { client: { equals: client } }, sort: "name", pagination: false, depth: 0, ...as(ctx) }),
    ctx.payload.find({ collection: "admins", pagination: false, depth: 0, ...as(ctx) }),
    reminderStates(database(), [id]),
  ]);
  // Return to where the edit started (same /crm-only rule as every form).
  const back = safeBack(param(search, "retour"), `/crm/clients/${client}`);
  const self = `/crm/activites/${id}?retour=${encodeURIComponent(back)}`;
  return (
    <>
      <Head title={activity.subject} eyebrow={<><Link href={back}>← Retour</Link> · <ClientLink client={company} /> · {activityKindLabel(activity.kind)}</>} />
      <Flash search={search} />
      <p className="crm-hint">
        Créée le {formatDateTime(activity.createdAt)}{activity.doneAt ? ` · terminée le ${formatDateTime(activity.doneAt)}` : ""}.
        {states.has(id) ? ` ${reminderText[states.get(id)!] ?? ""}` : activity.dueAt && !activity.done && activity.remind !== false ? " Un rappel email sera envoyé 30 minutes avant l’échéance si les rappels sont activés sur le serveur." : ""}
        {" "}Changer l’échéance programme un nouveau rappel.
      </p>
      <section className="crm-card">
        <ActivityForm activity={activity} contacts={contacts.docs} admins={admins.docs} back={self} />
      </section>
      <form action={deleteActivity} className="crm-danger">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="back" value={back} />
        <Submit className="crm-btn crm-btn--danger" confirm="Supprimer cette activité ?">Supprimer l’activité</Submit>
      </form>
    </>
  );
}
