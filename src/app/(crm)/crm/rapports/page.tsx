import Link from "next/link";
import { as, crmContext, formatDate } from "@/lib/crm-server";
import { activityKindLabel, exchangeKinds, lostReasonLabel, lostReasons, prospectStageLabel } from "@/lib/crm";
import { topicLabel, topics, serviceLabel, services } from "@/lib/contact-topics";
import { relationID } from "@/lib/access";
import { Head, param } from "@/components/crm/parts";
export const metadata = { title: "Indicateurs commerciaux" };
type Search = Promise<Record<string, string | string[] | undefined>>;
// Periods offered, in days. "Ce mois" is handled separately (from the 1st).
const periods = [
  ["30", "30 derniers jours"],
  ["90", "90 derniers jours"],
  ["mois", "Ce mois"],
  ["365", "12 derniers mois"],
] as const;
// Activity counted as a real exchange with the company.
const exchange = [...exchangeKinds];
// Stages that mean the company answered us at least once (see the caveat displayed
// below: only the CURRENT stage is known, there is no stage history).
const answered = ["engaged", "need", "meeting", "quote", "on-hold", "won"];
export default async function Reports({ searchParams }: { searchParams: Search }) {
  const search = await searchParams;
  const ctx = await crmContext();
  const { payload } = ctx;
  const chosen = periods.some(([v]) => v === param(search, "periode")) ? param(search, "periode") : "30";
  const now = new Date();
  const from =
    chosen === "mois"
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      : new Date(now.getTime() - Number(chosen) * 24 * 3600 * 1000);
  const since = from.toISOString();
  const periodLabel = periods.find(([v]) => v === chosen)![1].toLowerCase();
  const window = { greater_than_equal: since };
  const [exchanges, meetings, quotes, requests, lost, contactedClients] = await Promise.all([
    // Exchanges recorded over the period, whatever their outcome.
    payload.find({
      collection: "crm-activities",
      where: { kind: { in: exchange }, createdAt: window },
      pagination: false,
      depth: 0,
      select: { client: true, kind: true, createdAt: true },
      ...as(ctx),
    }),
    // Meetings actually held: a meeting activity marked done.
    payload.find({
      collection: "crm-activities",
      where: { kind: { equals: "meeting" }, done: { equals: true }, createdAt: window },
      pagination: false,
      depth: 0,
      select: { client: true },
      ...as(ctx),
    }),
    // Quotes that left the office: issued, accepted or refused, by issue date.
    payload.find({
      collection: "crm-documents",
      where: { kind: { equals: "quote" }, status: { in: ["sent", "accepted", "refused"] }, issueDate: window },
      pagination: false,
      depth: 0,
      select: { status: true, total: true, issueDate: true, client: true },
      ...as(ctx),
    }),
    // What visitors asked for, by need and by service page read.
    payload.find({
      collection: "contact-requests",
      where: { createdAt: window },
      pagination: false,
      depth: 0,
      select: { topic: true, service: true, createdAt: true },
      ...as(ctx),
    }),
    // Companies lost during the period, with their reason.
    payload.find({
      collection: "clients",
      where: { pipeline: { equals: "lost" }, pipelineAt: window },
      pagination: false,
      depth: 0,
      select: { name: true, lostReason: true, pipelineAt: true },
      ...as(ctx),
    }),
    payload.find({ collection: "clients", pagination: false, depth: 0, select: { pipeline: true, needs: true }, ...as(ctx) }),
  ]);
  const contacted = new Set(exchanges.docs.map((a) => String(relationID(a.client))).filter((v) => v !== "null"));
  const stageOf = new Map(contactedClients.docs.map((c) => [String(c.id), c.pipeline ?? "to-contact"]));
  const replied = [...contacted].filter((id) => answered.includes(String(stageOf.get(id))));
  const rate = contacted.size ? Math.round((replied.length / contacted.size) * 100) : null;
  const byKind = exchange.map((k) => ({ kind: k, count: exchanges.docs.filter((a) => a.kind === k).length }));
  const meetingClients = new Set(meetings.docs.map((a) => String(relationID(a.client))));
  const quoteAmount = quotes.docs.reduce((s, d) => s + (d.total || 0), 0);
  const byTopic = topics.map(([v]) => ({ value: v, count: requests.docs.filter((r) => r.topic === v).length }));
  const byService = services.map(([v]) => ({ value: v, count: requests.docs.filter((r) => r.service === v).length }));
  const noService = requests.docs.filter((r) => !r.service).length;
  // Besoins déclarés sur les fiches entreprises : vision durable, là où les demandes du
  // site ne montrent que le flux entrant de la période.
  const byNeed = topics.map(([v]) => ({
    value: v,
    count: contactedClients.docs.filter((c) => ((c.needs ?? []) as string[]).includes(v)).length,
  }));
  const withNeeds = contactedClients.docs.filter((c) => ((c.needs ?? []) as string[]).length).length;
  const byReason = lostReasons
    .map(([v]) => ({ value: v, count: lost.docs.filter((c) => c.lostReason === v).length }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  const noReason = lost.docs.filter((c) => !c.lostReason).length;
  const cards = [
    {
      label: "Entreprises contactées",
      value: String(contacted.size),
      note: `Entreprises distinctes avec au moins un échange enregistré (${exchange.map(activityKindLabel).join(", ").toLowerCase()}) sur la période. Dénominateur : aucun — c’est un décompte.`,
    },
    {
      label: "Taux de réponse",
      value: rate === null ? "—" : `${rate} %`,
      note: `${replied.length} entreprises sur ${contacted.size} contactées sont aujourd’hui à une étape qui suppose une réponse (${answered.map(prospectStageLabel).join(", ").toLowerCase()}). Dénominateur : les entreprises contactées sur la période.`,
      warn: rate !== null && rate < 25,
    },
    {
      label: "Rendez-vous réalisés",
      value: String(meetings.totalDocs),
      note: `Activités « rendez-vous » marquées faites, créées sur la période, pour ${meetingClients.size} entreprise(s). Dénominateur : aucun.`,
    },
    {
      label: "Devis envoyés",
      value: String(quotes.totalDocs),
      note: `Devis à l’état envoyé, accepté ou refusé, datés de la période (date d’émission). Montant total : ${new Intl.NumberFormat("fr-FR").format(quoteAmount)} FCFA. Dénominateur : aucun.`,
    },
    {
      label: "Demandes du site",
      value: String(requests.totalDocs),
      note: "Formulaire Contact, sur la période. Réparties par besoin et par page de service ci-dessous.",
    },
    {
      label: "Entreprises perdues",
      value: String(lost.docs.length),
      note: "Entreprises passées à l’étape « Perdu » sur la période (date de changement d’étape). Raisons détaillées ci-dessous.",
    },
  ];
  return (
    <>
      <Head title="Indicateurs commerciaux" eyebrow={`Période : ${periodLabel}, depuis le ${formatDate(since)}`}>
        <Link className="crm-btn crm-btn--ghost" href="/crm">Accueil</Link>
      </Head>
      <nav className="crm-tabs" aria-label="Période">
        {periods.map(([value, label]) => (
          <Link key={value} href={`/crm/rapports?periode=${value}`} aria-current={chosen === value ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      <p className="crm-hint">
        Chaque indicateur indique ce qu’il compte et sur quel dénominateur. Tout est calculé
        à partir des activités, devis, demandes et étapes réellement enregistrés : aucun
        chiffre estimé. Les montants du pipeline et de la facturation restent sur l’accueil.
      </p>
      <section className="crm-stats" aria-label="Indicateurs de la période">
        {cards.map((c) => (
          <div key={c.label} className={`crm-stat${c.warn ? " crm-stat--warn" : ""}`}>
            <strong>{c.value}</strong>
            <span>{c.label}</span>
          </div>
        ))}
      </section>
      <section className="crm-card">
        <h2>Définitions</h2>
        <ul className="crm-list">
          {cards.map((c) => (
            <li key={c.label}>
              <span><strong>{c.label}</strong> : {c.note}</span>
            </li>
          ))}
        </ul>
        <p className="crm-hint">
          Limite du taux de réponse : seule l’étape <em>actuelle</em> de chaque entreprise est
          connue, l’historique des changements d’étape n’est pas conservé. Une entreprise
          contactée, passée à « Échange engagé » puis reclassée « Perdu » n’est donc pas
          comptée comme ayant répondu. À lire comme un ordre de grandeur, pas comme un
          taux d’ouverture de campagne — aucun envoi de masse n’est réalisé depuis le CRM.
        </p>
      </section>
      <div className="crm-cols">
        <section className="crm-card">
          <h2>Échanges par type</h2>
          <p className="crm-hint">Nombre d’activités enregistrées sur la période, tous résultats confondus.</p>
          <ul className="crm-bars">
            {byKind.map((k) => (
              <li key={k.kind}>
                <span className="crm-bars__label">{activityKindLabel(k.kind)}</span>
                <span className="crm-bars__track">
                  <span className="crm-bars__fill" style={{ width: `${(k.count / Math.max(1, ...byKind.map((x) => x.count))) * 100}%` }} />
                </span>
                <span className="crm-bars__value">{k.count}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="crm-card">
          <h2>Services demandés</h2>
          <p className="crm-hint">Besoin choisi dans le formulaire Contact ({requests.totalDocs} demande{requests.totalDocs > 1 ? "s" : ""} sur la période).</p>
          <ul className="crm-bars">
            {byTopic.map((t) => (
              <li key={t.value}>
                <span className="crm-bars__label">{topicLabel(t.value)}</span>
                <span className="crm-bars__track">
                  <span className="crm-bars__fill" style={{ width: `${(t.count / Math.max(1, ...byTopic.map((x) => x.count))) * 100}%` }} />
                </span>
                <span className="crm-bars__value">{t.count}</span>
              </li>
            ))}
          </ul>
          <h3>Page de service consultée</h3>
          <ul className="crm-list">
            {byService.map((s) => (
              <li key={s.value}><span>{serviceLabel(s.value)}</span><small>{s.count}</small></li>
            ))}
            <li><span>Sans page de service (accueil, contact direct)</span><small>{noService}</small></li>
          </ul>
          <p className="crm-hint">La page consultée n’est enregistrée que depuis la mise en place du contexte de service : les demandes antérieures apparaissent toutes « sans page de service ».</p>
          <h3>Besoins déclarés sur les fiches</h3>
          <p className="crm-hint">Toutes périodes confondues : {withNeeds} entreprise{withNeeds > 1 ? "s" : ""} sur {contactedClients.totalDocs} ont au moins un besoin renseigné.</p>
          <ul className="crm-list">
            {byNeed.map((n) => (
              <li key={n.value}><span>{topicLabel(n.value)}</span><small>{n.count}</small></li>
            ))}
          </ul>
        </section>
        <section className="crm-card">
          <h2>Raisons de perte</h2>
          {byReason.length ? (
            <>
              <ul className="crm-bars">
                {byReason.map((r) => (
                  <li key={r.value}>
                    <span className="crm-bars__label">{lostReasonLabel(r.value)}</span>
                    <span className="crm-bars__track">
                      <span className="crm-bars__fill" style={{ width: `${(r.count / byReason[0].count) * 100}%` }} />
                    </span>
                    <span className="crm-bars__value">{r.count}</span>
                  </li>
                ))}
              </ul>
              {noReason > 0 && <p className="crm-hint">{noReason} entreprise(s) perdue(s) sans raison enregistrée (perte antérieure à la règle qui l’exige).</p>}
            </>
          ) : (
            <p className="crm-empty">Aucune entreprise perdue sur la période.</p>
          )}
          <Link className="crm-more" href="/crm/clients?etape=lost">Toutes les entreprises perdues →</Link>
        </section>
      </div>
    </>
  );
}
