import type { CollectionBeforeChangeHook, CollectionConfig, Field, PayloadRequest } from "payload";
import { APIError } from "payload";
import { crmOnly, isAdmin, isFullAdmin, relationID } from "@/lib/access";
import {
  activityKinds,
  clientSources,
  defaultVatRate,
  documentEditable,
  documentKinds,
  documentTotals,
  documentTransitions,
  invoiceStatuses,
  creditStatuses,
  invoiceTypes,
  invoiceBalance,
  nextDocumentNumber,
  normalizeSearch,
  quoteStatuses,
  type DocumentKind,
  clientStages,
  dealStages,
  beforeQuoteStages,
  lostReasons,
  prospectStages,
  defaultProbability,
  isOpenStage,
  options,
} from "@/lib/crm";
import { topics } from "@/lib/contact-topics";
// CRM: commercial follow-up of client companies. Admins only, never visible to
// client accounts. Companies are the existing "clients" collection (CRM fields below).
export const crmGroup = "CRM";
// Business-rule refusals: their French message is shown as is in /crm.
export class CRMRuleError extends APIError {
  readonly crmRule = true;
  constructor(message: string) {
    super(message, 400);
  }
}
// Full administrators and CRM-only accounts (never technicians nor client accounts).
const adminAccess = { create: crmOnly, read: crmOnly, update: crmOnly, delete: crmOnly };
const isWebsite = (value: unknown) =>
  value == null || value === "" || /^https?:\/\/[^\s/@]+\.[^\s@]+$/i.test(String(value)) ||
  "Adresse complète en http(s):// requise.";
// Accent-free copy of the searchable fields, matched with pg_trgm (src/lib/crm-search.ts).
export const searchField: Field = {
  name: "searchText",
  type: "text",
  admin: { hidden: true },
  // Never returned by the API; always recomputed by searchHook, whatever is sent.
  access: { read: () => false },
};
export const searchHook = (fields: string[]): CollectionBeforeChangeHook => ({ data, originalDoc }) => {
  const doc = { ...originalDoc, ...data } as Record<string, unknown>;
  data.searchText = normalizeSearch(...fields.map((f) => doc[f]));
  return data;
};
// Moves a company's commercial stage forward after a deal or quote event.
// "from" limits the move (a sent quote never pulls back a company already further on).
async function advanceCompany(req: PayloadRequest, client: unknown, to: "quote" | "won", from?: readonly string[]) {
  const id = relationID(client);
  if (id === null) return;
  const doc = await req.payload.findByID({ collection: "clients", id, depth: 0, req, overrideAccess: true });
  const current = doc.pipeline ?? "to-contact";
  if (from ? !from.includes(current) : current === to && doc.stage !== "prospect") return;
  await req.payload.update({ collection: "clients", id, data: { pipeline: to }, req, overrideAccess: true });
}
// Commercial stage rules, on every write (CRM pages, admin, API):
// date of the last change, "won" turns a prospect into a client, a loss needs its reason.
export const clientPipelineHook: CollectionBeforeChangeHook = ({ data, originalDoc, operation }) => {
  if (operation === "create" && !data.pipeline)
    data.pipeline = data.stage === "client" || data.stage === "inactive" ? "won" : "to-contact";
  const before = originalDoc?.pipeline ?? null;
  const pipeline = data.pipeline ?? before;
  if (operation === "create" || (data.pipeline !== undefined && data.pipeline !== before))
    data.pipelineAt = new Date().toISOString();
  if (pipeline === "won" && (data.stage ?? originalDoc?.stage) === "prospect") data.stage = "client";
  if (pipeline === "lost") {
    const reason = "lostReason" in data ? data.lostReason : originalDoc?.lostReason;
    if (!reason) throw new CRMRuleError("Indiquez la raison de la perte.");
  } else if (data.pipeline !== undefined || data.lostReason) data.lostReason = null;
  return data;
};
const ownerField: Field = {
  name: "owner",
  label: "Responsable",
  type: "relationship",
  relationTo: "admins",
  admin: { position: "sidebar" },
};
const clientField: Field = {
  name: "client",
  label: "Entreprise",
  type: "relationship",
  relationTo: "clients",
  required: true,
  index: true,
};
// Added to the existing Clients collection: every column is nullable or defaulted.
export const clientCRMFields: Field[] = [
  {
    name: "stage",
    label: "Statut commercial",
    type: "select",
    required: true,
    defaultValue: "client",
    index: true,
    options: options(clientStages),
    admin: { position: "sidebar" },
  },
  {
    name: "pipeline",
    label: "Étape commerciale",
    type: "select",
    defaultValue: "to-contact",
    index: true,
    options: options(prospectStages),
    admin: { position: "sidebar", description: "Suivi commercial : /crm/suivi." },
  },
  {
    name: "lostReason",
    label: "Raison de la perte",
    type: "select",
    options: options(lostReasons),
    admin: { position: "sidebar", condition: (data) => data?.pipeline === "lost" },
  },
  {
    name: "pipelineAt",
    label: "Étape depuis le",
    type: "date",
    admin: { position: "sidebar", readOnly: true },
  },
  // Besoins exprimés par l'entreprise. Même vocabulaire que le formulaire public et que
  // les tickets (lib/contact-topics), pour qu'une demande convertie, un ticket et une
  // fiche parlent des mêmes services. Renseigné à la conversion d'une demande du site,
  // puis complété à la main au fil des échanges.
  {
    name: "needs",
    label: "Besoins et services demandés",
    type: "select",
    hasMany: true,
    index: true,
    options: topics.map(([value, label]) => ({ value, label })),
    admin: { description: "Ce que l’entreprise demande. Repris dans les indicateurs commerciaux." },
  },
  {
    name: "needsDetail",
    label: "Détail du besoin",
    type: "textarea",
    maxLength: 2000,
    admin: { description: "Contexte, périmètre, contraintes : ce qui ne tient pas dans les cases ci-dessus." },
  },
  { ...ownerField },
  {
    name: "source",
    label: "Origine",
    type: "select",
    options: options(clientSources),
    admin: { position: "sidebar" },
  },
  {
    name: "sourceRequest",
    label: "Demande de contact d’origine",
    type: "relationship",
    relationTo: "contact-requests",
    index: true,
    admin: { position: "sidebar", readOnly: true },
  },
  {
    type: "collapsible",
    label: "Coordonnées et informations commerciales (CRM)",
    admin: { initCollapsed: true },
    fields: [
      {
        type: "row",
        fields: [
          { name: "sector", label: "Secteur d’activité", type: "text", maxLength: 80 },
          { name: "registration", label: "NINEA / RCCM", type: "text", maxLength: 80 },
        ],
      },
      {
        type: "row",
        fields: [
          { name: "email", label: "Email", type: "email" },
          { name: "phone", label: "Téléphone", type: "text", maxLength: 40 },
          { name: "website", label: "Site web", type: "text", maxLength: 200, validate: isWebsite },
        ],
      },
      { name: "address", label: "Adresse", type: "text", maxLength: 200 },
      {
        type: "row",
        fields: [
          { name: "city", label: "Ville", type: "text", maxLength: 80 },
          { name: "country", label: "Pays", type: "text", maxLength: 60 },
        ],
      },
      { name: "notes", label: "Notes", type: "textarea", maxLength: 5000 },
    ],
  },
  searchField,
];
export const clientSearchFields = ["name", "email", "phone", "city", "sector", "registration", "notes"];
export const CRMContacts: CollectionConfig = {
  slug: "crm-contacts",
  labels: { singular: "Contact", plural: "Contacts" },
  defaultSort: "name",
  admin: {
    useAsTitle: "name",
    group: crmGroup,
    // Managed in /crm (complete interface); kept out of /admin to avoid a duplicate.
    hidden: true,
    hideAPIURL: true,
    defaultColumns: ["name", "jobTitle", "client", "email", "phone"],
    listSearchableFields: ["name", "email", "phone", "jobTitle"],
    description: "Interlocuteurs des entreprises. Interface complète : /crm/contacts.",
  },
  access: adminAccess,
  hooks: {
    beforeValidate: [({ data }) => {
      if (typeof data?.email === "string") data.email = data.email.trim().toLowerCase() || null;
      return data;
    }],
    beforeChange: [searchHook(["name", "jobTitle", "email", "phone", "notes"])],
  },
  fields: [
    { name: "name", label: "Nom et prénom", type: "text", required: true, maxLength: 120 },
    { name: "jobTitle", label: "Fonction", type: "text", maxLength: 120 },
    clientField,
    {
      type: "row",
      fields: [
        { name: "email", label: "Email", type: "email" },
        { name: "phone", label: "Téléphone", type: "text", maxLength: 40 },
      ],
    },
    {
      name: "primary",
      label: "Interlocuteur principal",
      type: "checkbox",
      defaultValue: false,
      admin: { position: "sidebar" },
    },
    { name: "notes", label: "Notes", type: "textarea", maxLength: 5000 },
    searchField,
  ],
};
export const CRMDeals: CollectionConfig = {
  slug: "crm-deals",
  labels: { singular: "Opportunité", plural: "Opportunités" },
  defaultSort: "-updatedAt",
  admin: {
    useAsTitle: "title",
    group: crmGroup,
    // Managed in /crm (complete interface); kept out of /admin to avoid a duplicate.
    hidden: true,
    hideAPIURL: true,
    defaultColumns: ["title", "client", "stage", "amount", "expectedClose", "owner"],
    listSearchableFields: ["title", "notes"],
    description: "Affaires en cours et conclues. Pipeline visuel : /crm/opportunites.",
  },
  access: adminAccess,
  hooks: {
    beforeValidate: [async ({ data, originalDoc, req, operation }) => {
      if (!data) return data;
      const stage = data.stage ?? originalDoc?.stage;
      if (operation === "create" && (data.probability == null || data.probability === ""))
        data.probability = defaultProbability(stage);
      if (stage === "won") data.probability = 100;
      if (stage === "lost") data.probability = 0;
      // Closing date follows the stage: set on won/lost, cleared when reopened.
      if (data.stage !== undefined && data.stage !== originalDoc?.stage)
        data.closedAt = isOpenStage(stage) ? null : new Date().toISOString();
      const contact = relationID(data.contact ?? originalDoc?.contact);
      const client = relationID(data.client ?? originalDoc?.client);
      if (contact !== null && client !== null) {
        const doc = await req.payload.findByID({ collection: "crm-contacts", id: contact, depth: 0, req, overrideAccess: true });
        if (String(relationID(doc.client)) !== String(client))
          throw new CRMRuleError("Le contact n’appartient pas à cette entreprise.");
      }
      return data;
    }],
    afterChange: [async ({ doc, previousDoc, req }) => {
      // A won deal wins the company's follow-up, which turns a prospect into a client.
      if (doc.stage === "won" && previousDoc?.stage !== "won") await advanceCompany(req, doc.client, "won");
      return doc;
    }],
    beforeChange: [searchHook(["title", "notes"])],
  },
  fields: [
    searchField,
    { name: "title", label: "Intitulé", type: "text", required: true, maxLength: 160 },
    clientField,
    {
      name: "contact",
      label: "Contact",
      type: "relationship",
      relationTo: "crm-contacts",
      filterOptions: ({ data }) =>
        data?.client ? { client: { equals: relationID(data.client) } } : true,
    },
    {
      type: "row",
      fields: [
        { name: "amount", label: "Montant estimé (FCFA, HT)", type: "number", min: 0, max: 1e13, defaultValue: 0 },
        { name: "probability", label: "Probabilité (%)", type: "number", min: 0, max: 100 },
        { name: "expectedClose", label: "Clôture prévue", type: "date", admin: { date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" } } },
      ],
    },
    {
      name: "stage",
      label: "Étape",
      type: "select",
      required: true,
      defaultValue: "lead",
      index: true,
      options: options(dealStages),
      admin: { position: "sidebar" },
    },
    ownerField,
    {
      name: "closedAt",
      label: "Conclue le",
      type: "date",
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "lostReason",
      label: "Raison de la perte",
      type: "text",
      maxLength: 200,
      admin: { condition: (data) => data?.stage === "lost" },
    },
    { name: "notes", label: "Notes", type: "textarea", maxLength: 5000 },
  ],
};
export const CRMActivities: CollectionConfig = {
  slug: "crm-activities",
  labels: { singular: "Activité", plural: "Activités et tâches" },
  defaultSort: "-createdAt",
  admin: {
    useAsTitle: "subject",
    group: crmGroup,
    // Managed in /crm (complete interface); kept out of /admin to avoid a duplicate.
    hidden: true,
    hideAPIURL: true,
    defaultColumns: ["subject", "kind", "client", "dueAt", "done", "createdAt"],
    listSearchableFields: ["subject", "details"],
    description: "Historique des échanges et tâches à faire. Suivi : /crm/taches.",
  },
  access: adminAccess,
  hooks: {
    beforeValidate: [async ({ data, originalDoc, req, operation }) => {
      if (!data) return data;
      if (operation === "create") {
        if (!isAdmin(req.user)) throw new APIError("Accès réservé à l’équipe.", 403);
        data.author = req.user!.id;
      }
      // The company always follows the linked deal or contact.
      const deal = relationID(data.deal ?? originalDoc?.deal);
      const contact = relationID(data.contact ?? originalDoc?.contact);
      const linked = [
        deal !== null && await req.payload.findByID({ collection: "crm-deals", id: deal, depth: 0, req, overrideAccess: true }),
        contact !== null && await req.payload.findByID({ collection: "crm-contacts", id: contact, depth: 0, req, overrideAccess: true }),
      ].filter(Boolean) as { client: unknown }[];
      const client = relationID(data.client ?? originalDoc?.client) ?? relationID(linked[0]?.client);
      if (linked.some((l) => String(relationID(l.client)) !== String(client)))
        throw new CRMRuleError("Contact ou opportunité d’une autre entreprise.");
      data.client = client;
      if (data.done !== undefined && data.done !== originalDoc?.done)
        data.doneAt = data.done ? new Date().toISOString() : null;
      return data;
    }],
    beforeChange: [searchHook(["subject", "details"])],
  },
  fields: [
    searchField,
    {
      name: "kind",
      label: "Type",
      type: "select",
      required: true,
      defaultValue: "note",
      options: options(activityKinds),
    },
    { name: "subject", label: "Objet", type: "text", required: true, maxLength: 200 },
    { name: "details", label: "Détails", type: "textarea", maxLength: 10000 },
    clientField,
    { name: "deal", label: "Opportunité", type: "relationship", relationTo: "crm-deals", index: true },
    { name: "contact", label: "Contact", type: "relationship", relationTo: "crm-contacts" },
    {
      name: "request",
      label: "Demande de contact convertie",
      type: "relationship",
      relationTo: "contact-requests",
      index: true,
      admin: { readOnly: true, condition: (data) => !!data?.request },
    },
    {
      name: "dueAt",
      label: "Échéance (tâche ou rendez-vous à venir)",
      type: "date",
      index: true,
      admin: { position: "sidebar", date: { pickerAppearance: "dayAndTime", displayFormat: "dd/MM/yyyy HH:mm" } },
    },
    { name: "done", label: "Terminée", type: "checkbox", defaultValue: false, index: true, admin: { position: "sidebar" } },
    {
      name: "remind",
      label: "Rappel par email à l’échéance",
      type: "checkbox",
      defaultValue: true,
      admin: { position: "sidebar", description: "Envoyé à la personne assignée (sinon à l’auteur), si les rappels sont activés sur le serveur." },
    },
    { name: "doneAt", label: "Terminée le", type: "date", admin: { position: "sidebar", readOnly: true } },
    { name: "assignee", label: "Assignée à", type: "relationship", relationTo: "admins", admin: { position: "sidebar" } },
    {
      name: "author",
      label: "Créée par",
      type: "relationship",
      relationTo: "admins",
      access: { update: () => false },
      admin: { position: "sidebar", readOnly: true },
    },
  ],
};

const statusValues = [...new Set([...quoteStatuses, ...invoiceStatuses, ...creditStatuses].map(([v]) => v))];
const statusLabels: Record<string, string> = Object.fromEntries([...quoteStatuses, ...creditStatuses, ...invoiceStatuses]);
const kindStatuses = { quote: quoteStatuses, invoice: invoiceStatuses, credit: creditStatuses };
// Fields frozen once the document can no longer be edited (issued invoice or credit note, closed quote).
const frozen = ["client", "contact", "deal", "title", "lines", "vatRate", "validUntil", "dueDate", "conditions", "creditFor", "invoiceType"] as const;
const cleanLines = (lines: unknown) =>
  (Array.isArray(lines) ? lines : []).map((l) => ({
    description: l?.description ?? null,
    quantity: Number(l?.quantity) || 0,
    unit: l?.unit || null,
    unitPrice: Number(l?.unitPrice) || 0,
    vatRate: l?.vatRate == null ? null : Number(l.vatRate),
  }));
const comparable = (field: string, value: unknown) =>
  field === "lines" ? cleanLines(value) : ["client", "contact", "deal", "creditFor"].includes(field) ? relationID(value) : value ?? null;
const same = (field: string, a: unknown, b: unknown) =>
  JSON.stringify(comparable(field, a)) === JSON.stringify(comparable(field, b));
const cleanPayments = (payments: unknown) =>
  (Array.isArray(payments) ? payments : []).map((p) => ({ date: p?.date ?? null, amount: Number(p?.amount) || 0, note: p?.note || null }));
// Total of the issued credit notes of an invoice (optionally without one of them).
async function credited(req: PayloadRequest, invoice: string | number, except?: string | number) {
  const credits = await req.payload.find({
    collection: "crm-documents",
    where: { kind: { equals: "credit" }, status: { equals: "issued" }, creditFor: { equals: invoice }, ...(except ? { id: { not_equals: except } } : {}) },
    pagination: false, depth: 0, select: { total: true }, req, overrideAccess: true,
  });
  return credits.docs.reduce((s, d) => s + (d.total || 0), 0);
}
export const CRMDocuments: CollectionConfig = {
  slug: "crm-documents",
  labels: { singular: "Devis, facture ou avoir", plural: "Devis et factures" },
  defaultSort: "-createdAt",
  admin: {
    useAsTitle: "title",
    group: crmGroup,
    // Managed in /crm (complete interface); kept out of /admin to avoid a duplicate.
    hidden: true,
    hideAPIURL: true,
    defaultColumns: ["number", "kind", "title", "client", "status", "total", "balance", "issueDate"],
    listSearchableFields: ["number", "title"],
    description: "Devis, factures (dont acomptes) et avoirs. Création, paiements, PDF et envoi : /crm/documents.",
  },
  access: adminAccess,
  hooks: {
    beforeValidate: [async ({ data, originalDoc, req, operation }) => {
      if (!data) return data;
      const kind = (originalDoc?.kind ?? data.kind) as DocumentKind;
      if (operation === "update" && data.kind && data.kind !== originalDoc?.kind)
        throw new CRMRuleError("Le type d’un document ne change pas.");
      const before = String(originalDoc?.status ?? "draft");
      let status = String(data.status ?? before);
      if (!kindStatuses[kind]?.some(([v]) => v === status)) throw new CRMRuleError("Statut impossible pour ce type de document.");
      if (operation === "update" && status !== before && !documentTransitions[kind][before]?.includes(status))
        throw new CRMRuleError(`Passage de « ${statusLabels[before]} » à « ${statusLabels[status]} » impossible.`);
      if (operation === "create" && status !== "draft") throw new CRMRuleError("Un document est créé en brouillon.");
      // A CRM-only account prepares drafts; issuing, status changes, payments and credit
      // notes stay with a full administrator.
      if (req.user && !isFullAdmin(req.user)) {
        if (kind === "credit") throw new CRMRuleError("Les avoirs sont réservés à un administrateur complet.");
        if (before !== "draft" || status !== "draft")
          throw new CRMRuleError("Réservé à un administrateur complet : vous préparez les brouillons ; l’émission, les statuts et les paiements restent à l’administrateur.");
      }
      // Content is frozen outside the editable statuses.
      if (operation === "update" && !documentEditable(kind, before))
        for (const field of frozen)
          if (field in data && !same(field, data[field], originalDoc?.[field]))
            throw new CRMRuleError(
              kind === "quote" ? "Un devis accepté ou refusé ne se modifie plus."
                : "Un document émis ne se modifie plus : établissez un avoir, puis une nouvelle facture si besoin.",
            );
      const lines = data.lines ?? originalDoc?.lines ?? [];
      if (kind !== "invoice" && lines.some((l: { unitPrice?: number }) => Number(l?.unitPrice) < 0))
        throw new CRMRuleError("Les montants négatifs ne sont admis que sur une facture (déduction d’acompte).");
      Object.assign(data, documentTotals(lines, data.vatRate ?? originalDoc?.vatRate ?? defaultVatRate));
      if (data.total < 0) throw new CRMRuleError("Le total du document ne peut pas être négatif.");
      const id = originalDoc?.id;
      // Credit note: always for one numbered invoice of the same company, never above what is left.
      if (kind === "credit") {
        const target = relationID(data.creditFor ?? originalDoc?.creditFor);
        if (target === null) throw new CRMRuleError("Un avoir porte sur une facture.");
        const invoice = await req.payload.findByID({ collection: "crm-documents", id: target, depth: 0, req, overrideAccess: true });
        if (invoice.kind !== "invoice" || !invoice.number || invoice.status === "cancelled")
          throw new CRMRuleError("Un avoir porte sur une facture émise et non annulée.");
        data.client = relationID(invoice.client);
        if (status === "issued" && before === "draft") {
          const room = (invoice.total || 0) - (await credited(req, target, id));
          if ((data.total || 0) > room)
            throw new CRMRuleError(`L’avoir dépasse le montant encore créditable de la facture (${room.toLocaleString("fr-FR")} FCFA).`);
        }
      }
      if (kind === "invoice") {
        const payments = cleanPayments(data.payments ?? originalDoc?.payments);
        if ("payments" in data && !same("payments", cleanPayments(data.payments), cleanPayments(originalDoc?.payments)) && !["issued", "paid"].includes(before))
          throw new CRMRuleError("Les paiements s’enregistrent sur une facture émise.");
        if (payments.some((p) => !(p.amount > 0) || !p.date)) throw new CRMRuleError("Chaque paiement a une date et un montant positif.");
        const credit = id ? await credited(req, id) : 0;
        const { amountPaid, balance } = invoiceBalance(data.total, payments, credit);
        if (balance < 0) throw new CRMRuleError("Les paiements dépassent le montant restant dû.");
        if (status === "cancelled" && before !== "cancelled" && (amountPaid > 0 || credit > 0))
          throw new CRMRuleError("Une facture payée ou créditée ne s’annule pas : établissez un avoir.");
        Object.assign(data, { amountPaid, balance });
        // Settled = nothing left to pay (payments and credit notes); reopened otherwise.
        if (["issued", "paid"].includes(status)) status = balance <= 0 ? "paid" : "issued";
        data.status = status;
        const last = payments.map((p) => String(p.date)).sort().at(-1);
        data.paidAt = status === "paid" ? last ?? new Date().toISOString() : null;
      }
      // Number on leaving draft: max of the year + 1 (unique index: a race is refused, never doubled).
      if (before === "draft" && status !== "draft" && !originalDoc?.number) {
        if (!lines.length) throw new CRMRuleError("Ajoutez au moins une ligne avant d’émettre le document.");
        const now = new Date(), year = now.getUTCFullYear();
        const prefix = nextDocumentNumber(kind, year, null).slice(0, -4);
        const last = await req.payload.find({
          collection: "crm-documents", where: { number: { like: prefix } }, sort: "-number", limit: 1, depth: 0, req, overrideAccess: true,
          select: { number: true },
        });
        data.number = nextDocumentNumber(kind, year, last.docs[0]?.number);
        data.issueDate ??= originalDoc?.issueDate ?? now.toISOString();
      }
      const contact = relationID(data.contact ?? originalDoc?.contact);
      const client = relationID(data.client ?? originalDoc?.client);
      const deal = relationID(data.deal ?? originalDoc?.deal);
      for (const [collection, rel] of [["crm-contacts", contact], ["crm-deals", deal]] as const)
        if (rel !== null && client !== null) {
          const doc = await req.payload.findByID({ collection, id: rel, depth: 0, req, overrideAccess: true });
          if (String(relationID(doc.client)) !== String(client))
            throw new CRMRuleError("Contact ou opportunité d’une autre entreprise.");
        }
      return data;
    }],
    beforeChange: [searchHook(["number", "title"])],
    afterChange: [async ({ doc, previousDoc, req }) => {
      // An accepted quote wins its open deal (which also turns a prospect into a client).
      if (doc.kind === "quote" && doc.status === "accepted" && previousDoc?.status !== "accepted") {
        const id = relationID(doc.deal);
        if (id !== null) {
          const deal = await req.payload.findByID({ collection: "crm-deals", id, depth: 0, req, overrideAccess: true });
          if (isOpenStage(deal.stage))
            await req.payload.update({ collection: "crm-deals", id, data: { stage: "won", amount: doc.subtotal }, req, overrideAccess: true });
        }
        await advanceCompany(req, doc.client, "won");
      }
      // A sent quote moves the company's follow-up to "Devis envoyé".
      if (doc.kind === "quote" && doc.status === "sent" && previousDoc?.status !== "sent")
        await advanceCompany(req, doc.client, "quote", beforeQuoteStages);
      // An issued credit note lowers its invoice's balance: recompute it (may settle it).
      if (doc.kind === "credit" && doc.status === "issued" && previousDoc?.status !== "issued") {
        const id = relationID(doc.creditFor);
        if (id !== null) await req.payload.update({ collection: "crm-documents", id, data: {}, req, overrideAccess: true });
      }
      return doc;
    }],
    beforeDelete: [async ({ id, req }) => {
      const doc = await req.payload.findByID({ collection: "crm-documents", id, depth: 0, req, overrideAccess: true });
      if (doc.number) throw new CRMRuleError("Seul un brouillon peut être supprimé ; un document émis se corrige par un avoir.");
    }],
  },
  fields: [
    { name: "kind", label: "Type", type: "select", required: true, options: options(documentKinds), admin: { position: "sidebar" } },
    {
      name: "invoiceType",
      label: "Nature de la facture",
      type: "select",
      defaultValue: "standard",
      options: options(invoiceTypes),
      admin: { position: "sidebar", condition: (d) => d?.kind === "invoice" },
    },
    {
      name: "number",
      label: "Numéro",
      type: "text",
      unique: true,
      admin: { position: "sidebar", readOnly: true, description: "Attribué à l’émission (envoi du devis, émission de la facture ou de l’avoir)." },
    },
    {
      name: "status",
      label: "Statut",
      type: "select",
      required: true,
      defaultValue: "draft",
      index: true,
      options: statusValues.map((value) => ({ value, label: statusLabels[value] })),
      admin: { position: "sidebar" },
    },
    { name: "title", label: "Objet", type: "text", required: true, maxLength: 200 },
    clientField,
    { name: "contact", label: "À l’attention de", type: "relationship", relationTo: "crm-contacts" },
    { name: "deal", label: "Opportunité", type: "relationship", relationTo: "crm-deals", index: true },
    { name: "sourceQuote", label: "Devis d’origine", type: "relationship", relationTo: "crm-documents", index: true, admin: { readOnly: true } },
    {
      name: "creditFor",
      label: "Facture créditée",
      type: "relationship",
      relationTo: "crm-documents",
      index: true,
      admin: { readOnly: true, condition: (d) => d?.kind === "credit" },
    },
    {
      type: "row",
      fields: [
        { name: "issueDate", label: "Date d’émission", type: "date", admin: { readOnly: true } },
        { name: "validUntil", label: "Devis valable jusqu’au", type: "date", admin: { condition: (d) => d?.kind === "quote" } },
        { name: "dueDate", label: "Échéance de paiement", type: "date", index: true, admin: { condition: (d) => d?.kind === "invoice" } },
      ],
    },
    {
      name: "lines",
      label: "Lignes",
      type: "array",
      maxRows: 60,
      labels: { singular: "Ligne", plural: "Lignes" },
      fields: [
        { name: "description", label: "Désignation", type: "textarea", required: true, maxLength: 1000 },
        {
          type: "row",
          fields: [
            { name: "quantity", label: "Quantité", type: "number", required: true, min: 0, max: 1e6 },
            { name: "unit", label: "Unité", type: "text", maxLength: 20 },
            { name: "unitPrice", label: "Prix unitaire HT (FCFA, négatif pour une déduction)", type: "number", required: true, min: -1e12, max: 1e12 },
            { name: "vatRate", label: "TVA (%)", type: "number", min: 0, max: 100 },
          ],
        },
      ],
    },
    { name: "vatRate", label: "TVA par défaut des lignes (%)", type: "number", defaultValue: defaultVatRate, min: 0, max: 100 },
    {
      type: "row",
      fields: [
        { name: "subtotal", label: "Total HT", type: "number", admin: { readOnly: true } },
        { name: "vat", label: "TVA", type: "number", admin: { readOnly: true } },
        { name: "total", label: "Total TTC", type: "number", admin: { readOnly: true } },
      ],
    },
    {
      name: "payments",
      label: "Paiements reçus",
      type: "array",
      maxRows: 100,
      labels: { singular: "Paiement", plural: "Paiements" },
      admin: { condition: (d) => d?.kind === "invoice" },
      fields: [
        {
          type: "row",
          fields: [
            { name: "date", label: "Date", type: "date", required: true },
            { name: "amount", label: "Montant TTC (FCFA)", type: "number", required: true, min: 1, max: 1e13 },
            { name: "note", label: "Mode et référence", type: "text", maxLength: 200 },
          ],
        },
      ],
    },
    {
      type: "row",
      fields: [
        { name: "amountPaid", label: "Total payé", type: "number", admin: { readOnly: true, condition: (d) => d?.kind === "invoice" } },
        { name: "balance", label: "Reste à payer", type: "number", index: true, admin: { readOnly: true, condition: (d) => d?.kind === "invoice" } },
      ],
    },
    { name: "conditions", label: "Conditions (paiement, délais, validité)", type: "textarea", maxLength: 3000 },
    { name: "paidAt", label: "Soldée le", type: "date", admin: { position: "sidebar", readOnly: true } },
    { name: "paymentNote", label: "Règlement (mode, référence)", type: "text", maxLength: 200, admin: { position: "sidebar", hidden: true } },
    { name: "notes", label: "Notes internes (non imprimées)", type: "textarea", maxLength: 5000 },
    searchField,
  ],
};
