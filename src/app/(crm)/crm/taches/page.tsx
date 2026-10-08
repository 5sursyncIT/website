import type { Where } from "payload";
import { as, crmContext } from "@/lib/crm-server";
import { activityKinds } from "@/lib/crm";
import { database } from "@/lib/database";
import { crmEmailEnabled, reminderStates } from "@/lib/crm-reminders";
import { searchWhere } from "@/lib/crm-search";
import { searchText } from "@/lib/crm-server";
import { ActivityForm, Flash, Head, Timeline, param } from "@/components/crm/parts";
export const metadata = { title: "Tâches et activités" };
type Search = Promise<Record<string, string | string[] | undefined>>;
export default async function Tasks({ searchParams }: { searchParams: Search }) {
  const search = await searchParams;
  const ctx = await crmContext();
  const { payload, user } = ctx;
  const mine = param(search, "qui") === "moi";
  const kind = activityKinds.some(([v]) => v === param(search, "type")) ? param(search, "type") : "";
  const now = new Date();
  const dayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
  const q = searchText(search.q);
  const filters: Where[] = [
    ...(mine ? [{ assignee: { equals: user.id } }] : []),
    ...(kind ? [{ kind: { equals: kind } }] : []),
    ...(q ? [await searchWhere("activities", q)] : []),
  ];
  const find = (extra: Where[], sort: string, limit: number) =>
    payload.find({
      collection: "crm-activities",
      where: { and: [...filters, ...extra] },
      sort,
      limit,
      depth: 1,
      populate: { clients: { name: true }, "crm-deals": { title: true }, "crm-contacts": { name: true }, admins: { name: true, email: true } },
      ...as(ctx),
    });
  const [late, today, upcoming, undated, done, clients, admins] = await Promise.all([
    find([{ done: { equals: false } }, { dueAt: { less_than: now.toISOString() } }], "dueAt", 100),
    find([{ done: { equals: false } }, { dueAt: { greater_than_equal: now.toISOString() } }, { dueAt: { less_than: dayEnd } }], "dueAt", 100),
    find([{ done: { equals: false } }, { dueAt: { greater_than_equal: dayEnd } }], "dueAt", 100),
    find([{ done: { equals: false } }, { dueAt: { exists: false } }], "-createdAt", 100),
    find([{ done: { equals: true } }], "-updatedAt", 30),
    payload.find({ collection: "clients", where: { stage: { not_equals: "inactive" } }, sort: "name", pagination: false, depth: 0, select: { name: true }, ...as(ctx) }),
    payload.find({ collection: "admins", pagination: false, depth: 0, ...as(ctx) }),
  ]);
  const reminders = await reminderStates(database(), [late, today, upcoming, undated, done].flatMap((r) => r.docs.map((a) => a.id)));
  const query = new URLSearchParams({ ...(mine ? { qui: "moi" } : {}), ...(kind ? { type: kind } : {}), ...(q ? { q } : {}) }).toString();
  const back = `/crm/taches${query ? "?" + query : ""}`;
  const groups = [
    { title: "En retard", docs: late.docs, warn: true },
    { title: "Aujourd’hui", docs: today.docs },
    { title: "À venir", docs: upcoming.docs },
    { title: "Sans échéance", docs: undated.docs },
  ];
  return (
    <>
      <Head title="Tâches et activités" eyebrow={`${late.totalDocs} en retard · ${today.totalDocs} aujourd’hui · ${upcoming.totalDocs} à venir`} />
      <Flash search={search} />
      <p className={`crm-hint crm-reminder-status${crmEmailEnabled() ? " is-on" : ""}`}>
        {crmEmailEnabled()
          ? "Rappels email actifs : un email part 30 minutes avant chaque échéance (case « Rappel par email »), et un récapitulatif chaque matin à 7 h à chaque personne qui a des tâches en retard ou du jour."
          : "Rappels email non activés sur ce serveur : aucun email n’est envoyé. Consultez cette page et le tableau de bord."}
      </p>
      <form className="crm-filters">
        <input name="q" type="search" defaultValue={q} placeholder="Objet ou détails…" aria-label="Rechercher une activité" />
        <select name="qui" defaultValue={mine ? "moi" : ""} aria-label="Assignation">
          <option value="">Toute l’équipe</option>
          <option value="moi">Assignées à moi</option>
        </select>
        <select name="type" defaultValue={kind} aria-label="Type">
          <option value="">Tous les types</option>
          {activityKinds.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className="crm-btn crm-btn--ghost">Filtrer</button>
      </form>
      <div className="crm-cols crm-cols--wide">
        <div className="crm-stack">
          {groups.map((g) => (
            <section key={g.title} className={`crm-card${g.warn && g.docs.length ? " crm-card--warn" : ""}`}>
              <h2>{g.title} <span className="crm-count">{g.docs.length}</span></h2>
              <Timeline activities={g.docs} back={back} showClient reminders={reminders} />
            </section>
          ))}
        </div>
        <div className="crm-stack">
          <section className="crm-card">
            <h2>Nouvelle tâche ou activité</h2>
            {clients.docs.length ? (
              <ActivityForm clients={clients.docs} contacts={[]} admins={admins.docs} back={back} />
            ) : (
              <p className="crm-empty">Créez d’abord une entreprise.</p>
            )}
          </section>
          <section className="crm-card">
            <h2>Récemment terminées</h2>
            <Timeline activities={done.docs} back={back} showClient reminders={reminders} />
          </section>
        </div>
      </div>
    </>
  );
}
