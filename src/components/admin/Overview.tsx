import type { ServerProps } from "payload";
import { topicLabel } from "@/lib/contact-topics";
// Dashboard summary: what needs attention first. Only rendered for logged-in admins.
const statusLabels: Record<string, string> = {
  open: "Ouvert",
  "in-progress": "En cours",
  "waiting-client": "En attente client",
};
const when = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Dakar",
});
export async function Overview({ payload }: ServerProps) {
  const admin = payload.config.routes.admin;
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const active = { status: { in: Object.keys(statusLabels) } };
  const [week, failed, openTickets, contacts, tickets] = await Promise.all([
    payload.count({
      collection: "contact-requests",
      where: { createdAt: { greater_than: weekAgo } },
    }),
    payload.count({
      collection: "contact-requests",
      where: { notification: { equals: "failed" } },
    }),
    payload.count({ collection: "tickets", where: active }),
    payload.find({
      collection: "contact-requests",
      sort: "-createdAt",
      limit: 5,
      depth: 0,
      select: { name: true, company: true, topic: true, createdAt: true },
    }),
    payload.find({
      collection: "tickets",
      where: active,
      sort: "-updatedAt",
      limit: 5,
      depth: 1,
      select: { subject: true, status: true, client: true, updatedAt: true },
    }),
  ]);
  const stats = [
    {
      label: "Demandes de contact (7 jours)",
      value: week.totalDocs,
      href: `${admin}/collections/contact-requests`,
    },
    {
      label: "Tickets à traiter",
      value: openTickets.totalDocs,
      href: `${admin}/collections/tickets`,
    },
    {
      label: "Alertes email en échec",
      value: failed.totalDocs,
      href: `${admin}/collections/contact-requests?where[notification][equals]=failed`,
      warn: failed.totalDocs > 0,
    },
  ];
  return (
    <section className="sync-overview">
      <div className="sync-overview__head">
        <h2>Bonjour, voici l’essentiel</h2>
        <span>
          <a className="sync-overview__site" href="/crm">
            Ouvrir le CRM →
          </a>{" "}
          <a className="sync-overview__site" href="/" target="_blank" rel="noopener">
            Voir le site ↗
          </a>
        </span>
      </div>
      <div className="sync-overview__stats">
        {stats.map((s) => (
          <a
            key={s.label}
            href={s.href}
            className={`sync-stat${s.warn ? " sync-stat--warn" : ""}`}
          >
            <strong>{s.value}</strong>
            <span>{s.label}</span>
          </a>
        ))}
      </div>
      <div className="sync-overview__lists">
        <div className="sync-panel">
          <h3>Dernières demandes de contact</h3>
          {contacts.docs.length ? (
            <ul>
              {contacts.docs.map((c) => (
                <li key={c.id}>
                  <a href={`${admin}/collections/contact-requests/${c.id}`}>
                    <span>
                      <strong>{c.name}</strong>
                      {c.company ? ` · ${c.company}` : ""}
                    </span>
                    <small>
                      {topicLabel(c.topic)} · {when.format(new Date(c.createdAt))}
                    </small>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sync-panel__empty">Aucune demande pour l’instant.</p>
          )}
        </div>
        <div className="sync-panel">
          <h3>Tickets en cours</h3>
          {tickets.docs.length ? (
            <ul>
              {tickets.docs.map((t) => (
                <li key={t.id}>
                  <a href={`${admin}/collections/tickets/${t.id}`}>
                    <strong>{t.subject}</strong>
                    <small>
                      {typeof t.client === "object" && t.client ? `${t.client.name} · ` : ""}
                      {statusLabels[t.status] ?? t.status} ·{" "}
                      {when.format(new Date(t.updatedAt))}
                    </small>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sync-panel__empty">Aucun ticket à traiter.</p>
          )}
        </div>
      </div>
    </section>
  );
}
