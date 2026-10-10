import { as, crmContext } from "@/lib/crm-server";
import { templateRows } from "@/lib/crm-import";
import { activityKindLabel, clientSourceLabel, clientStageLabel, csv, dealStageLabel, documentKindLabel, documentStatusLabel, lostReasonLabel, prospectStageLabel } from "@/lib/crm";
// CSV exports for the team (admins only, never cached). Same guard as the pages.
const name = (doc: unknown) => (doc && typeof doc === "object" && "name" in doc ? String(doc.name ?? "") : "");
const day = (v: unknown) => (v ? new Date(String(v)).toISOString().slice(0, 10) : "");
export async function GET(_: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const ctx = await crmContext();
  const { payload } = ctx;
  let rows: unknown[][];
  if (kind === "modele-clients") {
    // Import template: same columns as the export, one example row.
    return new Response(csv(templateRows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="modele-import-entreprises.csv"',
        "Cache-Control": "private, no-store",
      },
    });
  }
  if (kind === "clients") {
    const [{ docs }, planned] = await Promise.all([
      payload.find({ collection: "clients", sort: "name", pagination: false, depth: 1, populate: { admins: { name: true } }, ...as(ctx) }),
      payload.find({ collection: "crm-activities", where: { done: { equals: false }, dueAt: { exists: true } }, sort: "dueAt", pagination: false, depth: 0, select: { client: true, kind: true, subject: true, dueAt: true }, ...as(ctx) }),
    ]);
    // Soonest open dated action of each company.
    const next = new Map<unknown, (typeof planned.docs)[number]>();
    for (const a of planned.docs) if (!next.has(a.client)) next.set(a.client, a);
    rows = [
      // Follow-up columns last: the earlier columns keep their position for existing spreadsheets.
      ["Entreprise", "Statut", "Origine", "Secteur", "NINEA/RCCM", "Email", "Téléphone", "Site web", "Adresse", "Ville", "Pays", "Responsable", "Créée le", "Étape commerciale", "Raison de la perte", "Prochaine action"],
      ...docs.map((c) => {
        const a = next.get(c.id);
        return [c.name, clientStageLabel(c.stage), c.source ? clientSourceLabel(c.source) : "", c.sector, c.registration, c.email, c.phone, c.website, c.address, c.city, c.country, name(c.owner), day(c.createdAt),
          prospectStageLabel(c.pipeline), c.lostReason ? lostReasonLabel(c.lostReason) : "", a ? `${day(a.dueAt)} ${activityKindLabel(a.kind)} : ${a.subject}` : ""];
      }),
    ];
  } else if (kind === "contacts") {
    const { docs } = await payload.find({ collection: "crm-contacts", sort: "name", pagination: false, depth: 1, populate: { clients: { name: true } }, ...as(ctx) });
    rows = [
      ["Nom", "Fonction", "Entreprise", "Email", "Téléphone", "Principal"],
      ...docs.map((c) => [c.name, c.jobTitle, name(c.client), c.email, c.phone, c.primary ? "oui" : "non"]),
    ];
  } else if (kind === "opportunites") {
    const { docs } = await payload.find({ collection: "crm-deals", sort: "-updatedAt", pagination: false, depth: 1, populate: { clients: { name: true }, "crm-contacts": { name: true }, admins: { name: true } }, ...as(ctx) });
    rows = [
      ["Opportunité", "Entreprise", "Contact", "Étape", "Montant FCFA", "Probabilité %", "Clôture prévue", "Conclue le", "Responsable", "Raison de la perte"],
      ...docs.map((d) => [d.title, name(d.client), name(d.contact), dealStageLabel(d.stage), d.amount ?? 0, d.probability ?? "", day(d.expectedClose), day(d.closedAt), name(d.owner), d.lostReason]),
    ];
  } else if (kind === "documents") {
    const { docs } = await payload.find({ collection: "crm-documents", sort: "-createdAt", pagination: false, depth: 1, populate: { clients: { name: true } }, ...as(ctx) });
    rows = [
      ["Numéro", "Type", "Statut", "Objet", "Entreprise", "Date d’émission", "Échéance / validité", "Total HT", "TVA", "Total TTC", "Payé", "Reste dû", "Soldée le", "Paiements"],
      ...docs.map((d) => [
        d.number ?? "brouillon", documentKindLabel(d.kind, d.invoiceType), documentStatusLabel(d.kind, d.status), d.title, name(d.client),
        day(d.issueDate), day(d.kind === "invoice" ? d.dueDate : d.validUntil), d.subtotal ?? 0, d.vat ?? 0, d.total ?? 0,
        d.kind === "invoice" ? d.amountPaid ?? 0 : "", d.kind === "invoice" ? d.balance ?? "" : "", day(d.paidAt),
        (d.payments ?? []).map((p) => `${day(p.date)} ${p.amount} ${p.note ?? ""}`.trim()).join(" | "),
      ]),
    ];
  } else return new Response("Not found", { status: 404 });
  return new Response(csv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="crm-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
