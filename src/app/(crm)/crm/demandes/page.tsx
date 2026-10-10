import Link from "next/link";
import type { Where } from "payload";
import { as, crmContext, formatDateTime, pageNumber } from "@/lib/crm-server";
import { topicLabel } from "@/lib/contact-topics";
import { relationID } from "@/lib/access";
import { convertRequest } from "../actions";
import { Submit } from "@/components/crm/client";
import { Flash, Head, Pager, param } from "@/components/crm/parts";
export const metadata = { title: "Demandes du site" };
type Search = Promise<Record<string, string | string[] | undefined>>;
export default async function Requests({ searchParams }: { searchParams: Search }) {
  const search = await searchParams;
  const ctx = await crmContext();
  const { payload } = ctx;
  const page = pageNumber(search.page);
  const pending = param(search, "filtre") !== "toutes";
  // Every request already converted, whatever its age: the conversion activity carries it.
  // Filtering happens in the query below, so "À traiter" is a global filter with a real
  // total and real pages — never "nothing to treat" while an older request is waiting.
  const [converted, clients] = await Promise.all([
    payload.find({ collection: "crm-activities", where: { request: { exists: true } }, pagination: false, depth: 1, select: { request: true, client: true }, populate: { clients: { name: true } }, ...as(ctx) }),
    payload.find({ collection: "clients", sort: "name", pagination: false, depth: 0, select: { name: true }, ...as(ctx) }),
  ]);
  const linked = new Map(converted.docs.map((a) => [String(relationID(a.request)), a.client]));
  const treated = [...new Set(converted.docs.map((a) => relationID(a.request)).filter((v) => v !== null))];
  const untreated: Where = treated.length ? { id: { not_in: treated } } : {};
  const [requests, waiting] = await Promise.all([
    payload.find({ collection: "contact-requests", where: pending ? untreated : {}, sort: "-createdAt", page, limit: 20, depth: 0, ...as(ctx) }),
    payload.count({ collection: "contact-requests", where: untreated, ...as(ctx) }),
  ]);
  const shown = requests.docs;
  // Suggest an existing company with the same name (case-insensitive).
  const match = (company?: string | null) =>
    company ? clients.docs.find((c) => c.name.trim().toLowerCase() === company.trim().toLowerCase())?.id : undefined;
  return (
    <>
      <Head title="Demandes du site" eyebrow="Formulaire Contact → prospects" />
      <Flash search={search} />
      <p className="crm-hint">
        Convertir une demande crée (ou complète) l’entreprise, son contact et une activité contenant le message.
        La demande d’origine reste inchangée dans l’administration. Aucun email n’est envoyé au visiteur.
      </p>
      <nav className="crm-tabs" aria-label="Filtre">
        <Link href="/crm/demandes" aria-current={pending ? "page" : undefined}>À traiter ({waiting.totalDocs})</Link>
        <Link href="/crm/demandes?filtre=toutes" aria-current={pending ? undefined : "page"}>Toutes</Link>
      </nav>
      {shown.length === 0 && <p className="crm-empty">{pending ? "Aucune demande à traiter." : "Aucune demande."}</p>}
      <div className="crm-requests">
        {shown.map((r) => {
          const client = linked.get(String(r.id));
          return (
            <article key={r.id} id={`demande-${r.id}`} className="crm-card">
              <header className="crm-request__head">
                <div>
                  <h2>{r.company || r.name}</h2>
                  <small className="crm-sub">{r.name} · {topicLabel(r.topic)} · {formatDateTime(r.createdAt)}</small>
                </div>
                {client ? (
                  <Link className="crm-badge crm-badge--ok" href={`/crm/clients/${relationID(client)}`}>
                    Convertie → {typeof client === "object" && client ? client.name : "fiche"}
                  </Link>
                ) : (
                  <span className="crm-badge crm-badge--wait">À traiter</span>
                )}
              </header>
              <p className="crm-sub">
                <a href={`mailto:${r.email}`}>{r.email}</a>
                {r.phone && <> · <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`}>{r.phone}</a></>}
              </p>
              <p className="crm-pre">{r.message}</p>
              {!client && (
                <form action={convertRequest} className="crm-convert">
                  <input type="hidden" name="request" value={r.id} />
                  <input type="hidden" name="back" value={`/crm/demandes${pending ? "" : "?filtre=toutes"}`} />
                  <label>
                    Entreprise
                    <select name="client" defaultValue={match(r.company) ?? ""}>
                      <option value="">Créer le prospect « {r.company || r.name} »</option>
                      {clients.docs.map((c) => <option key={c.id} value={c.id}>Rattacher à {c.name}</option>)}
                    </select>
                  </label>
                  <label className="crm-check"><input type="checkbox" name="deal" defaultChecked /> Créer une opportunité « Piste »</label>
                  <Submit>Convertir</Submit>
                </form>
              )}
            </article>
          );
        })}
      </div>
      <Pager page={requests.page ?? 1} totalPages={requests.totalPages} base="/crm/demandes" search={search} />
    </>
  );
}
