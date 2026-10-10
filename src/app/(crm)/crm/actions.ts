"use server";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { relationID } from "@/lib/access";
import { activeProspectStages, activityKinds, creditStatuses, dealStages, defaultProbability, defaultVatRate, depositLines, documentKindLabel, documentKinds, exchangeKinds, isActiveProspect, isOpenStage, lostReasons, money, prospectStageLabel, prospectStageOf, prospectStages, quoteStatuses, invoiceStatuses } from "@/lib/crm";
import { contactSMTPTransport } from "@/lib/contact-smtp";
import { contactDetails } from "@/lib/contact-details";
import { crmEmailEnabled } from "@/lib/crm-reminders";
import { documentFilename, documentPDF } from "@/lib/crm-pdf";
import { sendDocumentMail } from "@/lib/crm-document-mail";
import { database } from "@/lib/database";
import { topicLabel, topics } from "@/lib/contact-topics";
import { as, crmContext, safeBack, withMessage, type CRMContext } from "@/lib/crm-server";
import { clientSchema, id, optionalEmail, optionalID, text, values } from "@/lib/crm-schema";
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from "payload";
import { decodeCSV, IMPORT_MAX_BYTES, importOptionsSchema, planImport, type ExistingClient, type PlannedRow } from "@/lib/crm-import";
// Server actions behind plain <form>s: they work without JavaScript and each one
// re-checks the admin session (an action ID can be called directly).
const optionalNumber = (max: number) =>
  z.preprocess((v) => (v === "" || v == null ? null : String(v).replace(/[\s  ]/g, "").replace(",", ".")),
    z.coerce.number().min(0).max(max).nullable());
// Dakar is UTC+0: date and datetime-local inputs are stored as UTC.
const optionalDate = z.preprocess(
  (v) => (typeof v === "string" && v ? new Date(v.length === 10 ? v + "T00:00:00Z" : v + ":00Z") : null),
  z.date().nullable(),
).transform((d) => (d && !isNaN(+d) ? d.toISOString() : null));
const checkbox = z.preprocess((v) => v === "on" || v === "true", z.boolean());
const form = (data: FormData) => Object.fromEntries([...data.keys()].map((k) => [k, data.get(k)]));
// contact_requests.topic est une colonne texte : une valeur inconnue n'entre pas
// dans les besoins d'une entreprise.
type Need = (typeof topics)[number][0];
const knownNeed = (topic: unknown): Need[] =>
  topics.some(([t]) => t === topic) ? [topic as Need] : [];
class UserError extends Error {}
// Runs the change, then redirects with a flash message. Validation and Payload
// errors come back as readable text, never as an error page.
async function run(data: FormData, fallback: string, work: (ctx: CRMContext) => Promise<string | void>, ok: string | (() => string)) {
  const ctx = await crmContext();
  const back = safeBack(data.get("back"), fallback);
  let destination: string;
  try {
    const path = (await work(ctx)) || back;
    destination = withMessage(path, "ok", typeof ok === "function" ? ok() : ok);
  } catch (error) {
    unstable_rethrow(error);
    const message =
      error instanceof z.ZodError
        ? error.issues.map((i) => i.message).join(" ")
        : error instanceof UserError
          ? error.message
          // CRMRuleError from the collection hooks (a name check would not survive minification).
          : error instanceof Error && "crmRule" in error
            ? error.message
          : error && typeof error === "object" && "status" in error && Number(error.status) === 400
            ? "Données invalides : vérifiez les champs."
            : error && typeof error === "object" && "status" in error && Number(error.status) === 404
              ? "Fiche introuvable (déjà supprimée ?)."
              : "L’enregistrement a échoué. Réessayez.";
    // Expected refusals (validation, business rules) are not server errors.
    if (!(error instanceof z.ZodError || error instanceof UserError || (error instanceof Error && "crmRule" in error))) console.error("crm action", error);
    destination = withMessage(back, "erreur", message);
  }
  redirect(destination);
}
export async function saveClient(data: FormData) {
  let message = "Entreprise enregistrée.";
  await run(data, "/crm/clients", async (ctx) => {
    // Les besoins arrivent en plusieurs valeurs sous le même nom : form() n'en garderait
    // qu'une seule, d'où le getAll explicite.
    const fields = clientSchema.parse({ ...form(data), needs: data.getAll("needs") });
    const existing = optionalID.parse(data.get("id"));
    const saved = existing
      ? await ctx.payload.update({ collection: "clients", id: existing, data: fields, ...as(ctx) })
      : await ctx.payload.create({ collection: "clients", data: fields, ...as(ctx) });
    // Same alert as the board and the company page (see missingNextAction in lib/crm.ts):
    // an active company with no dated action is signalled, never refused.
    if (isActiveProspect(saved.pipeline) && !(await plannedActions(ctx, saved.id as number)))
      message += " Aucune action prévue : planifiez la suivante.";
    return existing ? undefined : `/crm/clients/${saved.id}`;
  }, () => message);
}
export async function deleteClient(data: FormData) {
  await run(data, "/crm/clients", async (ctx) => {
    const client = id.parse(data.get("id"));
    const where = { client: { equals: client } };
    // Counted with full rights: a CRM-only account does not see Support data, but the guard must.
    const [accounts, tickets] = await Promise.all([
      ctx.payload.count({ collection: "client-accounts", where, overrideAccess: true }),
      ctx.payload.count({ collection: "tickets", where, overrideAccess: true }),
    ]);
    if (accounts.totalDocs || tickets.totalDocs)
      throw new UserError("Suppression impossible : cette entreprise a des utilisateurs ou tickets Support. Passez-la en « Ancien client ».");
    const numbered = await ctx.payload.count({ collection: "crm-documents", where: { ...where, number: { exists: true } }, ...as(ctx) });
    if (numbered.totalDocs)
      throw new UserError("Suppression impossible : cette entreprise a des devis ou factures numérotés. Passez-la en « Ancien client ».");
    // Children first: their client column is NOT NULL. One by one: a bulk delete
    // reports a failed document in its result instead of throwing.
    for (const collection of ["crm-documents", "crm-activities", "crm-deals", "crm-contacts"] as const) {
      const { docs } = await ctx.payload.find({ collection, where, pagination: false, depth: 0, ...as(ctx) });
      for (const doc of docs) await ctx.payload.delete({ collection, id: doc.id, ...as(ctx) });
    }
    await ctx.payload.delete({ collection: "clients", id: client, ...as(ctx) });
    return "/crm/clients";
  }, "Entreprise supprimée avec ses contacts, opportunités et activités.");
}
// CSV import of companies. Step 1 (preview) writes nothing; step 2 re-reads the same
// text, plans again against the current database and writes everything in one
// transaction: a refused row cancels the whole import.
export type ImportPreview = {
  error?: string;
  fileName?: string;
  csv?: string;
  options?: { defaultStage: string; duplicates: string };
  separator?: string;
  mapped?: string[];
  ignored?: string[];
  rows?: PlannedRow[];
  counts?: { total: number; create: number; complete: number; skip: number; error: number };
};
const existingFields = { name: true, source: true, sector: true, registration: true, email: true, phone: true, website: true, address: true, city: true, country: true, notes: true } as const;
async function existingClients(ctx: CRMContext) {
  const { docs } = await ctx.payload.find({ collection: "clients", pagination: false, depth: 0, select: existingFields, ...as(ctx) });
  return docs as unknown as ExistingClient[];
}
const separatorName = (s: string) => (s === ";" ? "point-virgule" : s === "," ? "virgule" : "tabulation");
export async function previewClientImport(_: ImportPreview, data: FormData): Promise<ImportPreview> {
  const ctx = await crmContext();
  const options = importOptionsSchema.parse({ defaultStage: data.get("defaultStage"), duplicates: data.get("duplicates") });
  const file = data.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choisissez un fichier CSV.", options };
  if (file.size > IMPORT_MAX_BYTES) return { error: `Fichier trop lourd (${Math.ceil(file.size / 1024)} Ko, maximum ${IMPORT_MAX_BYTES / 1024} Ko).`, options };
  if (!/\.(csv|txt)$/i.test(file.name)) return { error: "Format non pris en charge : enregistrez le tableau en CSV (.csv).", options };
  const csv = decodeCSV(new Uint8Array(await file.arrayBuffer()));
  if (csv.includes("\u0000")) return { error: "Ce fichier n’est pas un texte CSV (classeur Excel ?). Enregistrez-le en CSV.", options };
  const plan = planImport(csv, await existingClients(ctx), options);
  if (plan.errors.length) return { error: plan.errors.join(" "), fileName: file.name, options, ignored: plan.ignored };
  return { fileName: file.name.slice(0, 120), csv, options, separator: separatorName(plan.separator), mapped: plan.mapped, ignored: plan.ignored, rows: plan.rows, counts: plan.counts };
}
export async function importClients(data: FormData) {
  let summary = "";
  await run(data, "/crm/clients/importer", async (ctx) => {
    const csv = String(data.get("csv") ?? "");
    if (!csv || new TextEncoder().encode(csv).length > IMPORT_MAX_BYTES) throw new UserError("Fichier absent ou trop lourd : recommencez l’import.");
    const options = importOptionsSchema.parse({ defaultStage: data.get("defaultStage"), duplicates: data.get("duplicates") });
    const plan = planImport(csv, await existingClients(ctx), options);
    if (plan.errors.length) throw new UserError(plan.errors.join(" "));
    const work = plan.rows.filter((r) => r.action === "create" || r.action === "complete");
    if (!work.length) throw new UserError("Rien à importer : aucune ligne à créer ou à compléter.");
    const owner = checkbox.parse(data.get("owner")) ? (ctx.user.id as number) : null;
    const created: number[] = [];
    const req = await createLocalReq({ user: ctx.user }, ctx.payload);
    await initTransaction(req);
    try {
      for (const row of work) {
        try {
          if (row.action === "create") created.push((await ctx.payload.create({ collection: "clients", data: { ...row.data!, owner }, req, overrideAccess: false })).id as number);
          else await ctx.payload.update({ collection: "clients", id: row.target!.id, data: row.fill!, req, overrideAccess: false });
        } catch (error) {
          console.error("crm import row", row.line, error);
          throw new UserError(`Ligne ${row.line} (${row.name.slice(0, 80)}) refusée par le CRM : rien n’a été importé.`);
        }
      }
      await commitTransaction(req);
    } catch (error) {
      await killTransaction(req);
      throw error;
    }
    const c = plan.counts;
    // Imported companies start active without any action: say so instead of staying silent
    // (same alert as the board and the company page, see missingNextAction in lib/crm.ts).
    const unplanned = created.length
      ? await ctx.payload.count({
          collection: "clients",
          where: { and: [{ pipeline: { in: [...activeProspectStages] } }, { id: { in: created } }] },
          ...as(ctx),
        })
      : { totalDocs: 0 };
    summary = [`Import terminé : ${c.create} entreprise${c.create > 1 ? "s" : ""} créée${c.create > 1 ? "s" : ""}`,
      c.complete && `${c.complete} complétée${c.complete > 1 ? "s" : ""}`,
      c.skip && `${c.skip} ignorée${c.skip > 1 ? "s" : ""} (déjà présentes)`,
      c.error && `${c.error} ligne${c.error > 1 ? "s" : ""} en erreur non importée${c.error > 1 ? "s" : ""}`].filter(Boolean).join(", ") + "."
      + (unplanned.totalDocs ? ` ${unplanned.totalDocs} entreprise${unplanned.totalDocs > 1 ? "s" : ""} sans prochaine action : à planifier sur le suivi commercial.` : "");
    return "/crm/clients?tri=recent";
  }, () => summary);
}
const contactSchema = z.object({
  client: id,
  name: z.string().trim().min(1, "Nom du contact requis.").max(120),
  jobTitle: text(120),
  email: optionalEmail,
  phone: text(40),
  primary: checkbox,
  notes: text(5000),
});
export async function saveContact(data: FormData) {
  await run(data, "/crm/contacts", async (ctx) => {
    const fields = contactSchema.parse(form(data));
    const existing = optionalID.parse(data.get("id"));
    const doc = existing
      ? await ctx.payload.update({ collection: "crm-contacts", id: existing, data: fields, ...as(ctx) })
      : await ctx.payload.create({ collection: "crm-contacts", data: fields, ...as(ctx) });
    // A single main contact per company.
    if (fields.primary)
      await ctx.payload.update({
        collection: "crm-contacts",
        where: { client: { equals: fields.client }, primary: { equals: true }, id: { not_equals: doc.id } },
        data: { primary: false },
        ...as(ctx),
      });
  }, "Contact enregistré.");
}
export async function deleteContact(data: FormData) {
  await run(data, "/crm/contacts", async (ctx) => {
    await ctx.payload.delete({ collection: "crm-contacts", id: id.parse(data.get("id")), ...as(ctx) });
  }, "Contact supprimé.");
}
const dealSchema = z.object({
  client: id,
  title: z.string().trim().min(1, "Intitulé requis.").max(160),
  contact: optionalID,
  amount: optionalNumber(1e13).transform((v) => v ?? 0),
  probability: optionalNumber(100),
  expectedClose: optionalDate,
  stage: z.enum(values(dealStages)),
  owner: optionalID,
  lostReason: text(200),
  notes: text(5000),
});
export async function saveDeal(data: FormData) {
  await run(data, "/crm/opportunites", async (ctx) => {
    const fields = dealSchema.parse(form(data));
    const existing = optionalID.parse(data.get("id"));
    if (existing) {
      await ctx.payload.update({ collection: "crm-deals", id: existing, data: fields, ...as(ctx) });
      return;
    }
    const { probability, ...rest } = fields;
    // Without a probability the stage default applies (collection hook).
    const doc = await ctx.payload.create({
      collection: "crm-deals",
      data: probability == null ? rest : fields,
      ...as(ctx),
    });
    return data.get("back") ? undefined : `/crm/opportunites/${doc.id}`;
  }, "Opportunité enregistrée.");
}
export async function moveDeal(data: FormData) {
  await run(data, "/crm/opportunites", async (ctx) => {
    const stage = z.enum(values(dealStages)).parse(data.get("stage"));
    const deal = id.parse(data.get("id"));
    const current = await ctx.payload.findByID({ collection: "crm-deals", id: deal, depth: 0, ...as(ctx) });
    // Moving along the pipeline resets the probability to the stage default.
    await ctx.payload.update({
      collection: "crm-deals",
      id: deal,
      data: { stage, ...(isOpenStage(stage) && current.stage !== stage ? { probability: defaultProbability(stage) } : {}) },
      ...as(ctx),
    });
  }, "Étape mise à jour.");
}
export async function deleteDeal(data: FormData) {
  await run(data, "/crm/opportunites", async (ctx) => {
    const deal = id.parse(data.get("id"));
    await ctx.payload.update({ collection: "crm-activities", where: { deal: { equals: deal } }, data: { deal: null }, ...as(ctx) });
    await ctx.payload.delete({ collection: "crm-deals", id: deal, ...as(ctx) });
    return "/crm/opportunites";
  }, "Opportunité supprimée.");
}
const activitySchema = z.object({
  kind: z.enum(values(activityKinds)),
  subject: z.string().trim().min(1, "Objet requis.").max(200),
  details: text(10000),
  client: optionalID,
  deal: optionalID,
  contact: optionalID,
  dueAt: optionalDate,
  assignee: optionalID,
  done: checkbox,
  remind: checkbox,
});
export async function saveActivity(data: FormData) {
  await run(data, "/crm/taches", async (ctx) => {
    const fields = activitySchema.parse(form(data));
    const existing = optionalID.parse(data.get("id"));
    if (existing) {
      // Editing keeps the company; the hook re-checks the deal and contact against it.
      const { client, ...rest } = fields;
      await ctx.payload.update({ collection: "crm-activities", id: existing, data: client ? { ...rest, client } : rest, ...as(ctx) });
      return;
    }
    if (!fields.client && !fields.deal && !fields.contact) throw new UserError("Choisissez une entreprise.");
    // A past exchange without a due date is logged as done; a task stays open.
    const done = fields.done || (!fields.dueAt && fields.kind !== "task");
    await ctx.payload.create({
      collection: "crm-activities",
      data: { ...fields, client: fields.client as number, done },
      ...as(ctx),
    });
  }, data.get("id") ? "Activité modifiée." : "Activité ajoutée.");
}
// Open dated actions of a company (its "next actions"), optionally without one of them.
async function plannedActions(ctx: CRMContext, client: number, except?: number | null) {
  const { totalDocs } = await ctx.payload.count({
    collection: "crm-activities",
    where: { client: { equals: client }, done: { equals: false }, dueAt: { exists: true }, ...(except ? { id: { not_equals: except } } : {}) },
    ...as(ctx),
  });
  return totalDocs;
}
export async function toggleActivity(data: FormData) {
  let message = "Tâche mise à jour.";
  await run(data, "/crm/taches", async (ctx) => {
    const done = checkbox.parse(data.get("done"));
    const doc = await ctx.payload.update({ collection: "crm-activities", id: id.parse(data.get("id")), data: { done }, depth: 1, ...as(ctx) });
    // The last planned action of a company in progress is done: ask for the next one.
    const client = doc.client && typeof doc.client === "object" ? doc.client : null;
    if (done && client && isActiveProspect(client.pipeline) && !(await plannedActions(ctx, client.id))) {
      message = "Action terminée. Notez le résultat et planifiez la prochaine action.";
      return `/crm/clients/${client.id}#suivi`;
    }
  }, () => message);
}
// One form for the daily follow-up of a company: what happened (or the planned action
// now done), its commercial stage, and the next action. A company still in progress
// always keeps a dated next action with someone in charge.
const nextKinds = activityKinds.filter(([v]) => v !== "note");
const followUpSchema = z.object({
  client: id,
  close: optionalID,
  kind: z.enum(values(activityKinds)).default("call"),
  subject: text(200),
  details: text(10000),
  contact: optionalID,
  pipeline: z.enum(values(prospectStages)),
  lostReason: z.preprocess((v) => v || null, z.enum(values(lostReasons)).nullable()),
  nextKind: z.enum(values(nextKinds)).default("call"),
  nextSubject: text(200),
  nextDueAt: optionalDate,
  nextAssignee: optionalID,
});
export async function recordFollowUp(data: FormData) {
  const done: string[] = [];
  await run(data, "/crm", async (ctx) => {
    const f = followUpSchema.parse(form(data));
    const client = await ctx.payload.findByID({ collection: "clients", id: f.client, depth: 0, ...as(ctx) });
    const current = prospectStageOf(client.pipeline);
    const closing = f.close ? await ctx.payload.findByID({ collection: "crm-activities", id: f.close, depth: 0, ...as(ctx) }) : null;
    if (closing && String(relationID(closing.client)) !== String(client.id)) throw new UserError("Cette action appartient à une autre entreprise.");
    const exchanged = (exchangeKinds as readonly string[]).includes(closing?.kind ?? (f.subject ? f.kind : ""));
    // A first exchange takes the company out of "À contacter" unless another stage was chosen.
    const pipeline = f.pipeline === current && current === "to-contact" && exchanged ? "contacted" : f.pipeline;
    if (pipeline === "lost" && !f.lostReason) throw new UserError("Indiquez la raison de la perte.");
    if (isActiveProspect(pipeline) && !f.nextDueAt && !(await plannedActions(ctx, client.id, closing?.id)))
      throw new UserError("Planifiez la prochaine action (date et responsable), ou classez l’entreprise en « Gagné » ou « Perdu ».");
    if (closing) {
      const report = [closing.details, f.subject && `Compte rendu : ${f.subject}`, f.details].filter(Boolean).join("\n\n").slice(0, 10000);
      await ctx.payload.update({ collection: "crm-activities", id: closing.id, data: { done: true, details: report || null }, ...as(ctx) });
      done.push("action terminée");
    } else if (f.subject) {
      await ctx.payload.create({
        collection: "crm-activities",
        data: { kind: f.kind, subject: f.subject, details: f.details, client: client.id, contact: f.contact, done: true },
        ...as(ctx),
      });
      done.push("échange noté");
    }
    if (pipeline !== current || (pipeline === "lost" && f.lostReason !== client.lostReason)) {
      await ctx.payload.update({ collection: "clients", id: client.id, data: { pipeline, lostReason: pipeline === "lost" ? f.lostReason : null }, ...as(ctx) });
      done.push(`étape « ${prospectStageLabel(pipeline)} »`);
    }
    if (f.nextDueAt) {
      await ctx.payload.create({
        collection: "crm-activities",
        data: {
          kind: f.nextKind,
          subject: f.nextSubject || `Relancer ${client.name}`.slice(0, 200),
          client: client.id,
          contact: f.contact,
          dueAt: f.nextDueAt,
          assignee: f.nextAssignee ?? (relationID(client.owner) as number | null) ?? (ctx.user.id as number),
          done: false,
        },
        ...as(ctx),
      });
      done.push("prochaine action planifiée");
    }
    if (!done.length) throw new UserError("Rien à enregistrer.");
  }, () => `Suivi enregistré : ${done.join(", ")}.`);
}
// Board of /crm/suivi: same rules as the follow-up form for a loss (its reason is
// chosen on the company page).
export async function moveProspect(data: FormData) {
  let message = "Étape mise à jour.";
  await run(data, "/crm/suivi", async (ctx) => {
    const stage = z.enum(values(prospectStages)).parse(data.get("stage"));
    const client = await ctx.payload.findByID({ collection: "clients", id: id.parse(data.get("id")), depth: 0, ...as(ctx) });
    if (stage === "lost") {
      message = `Choisissez la raison de la perte de ${client.name}, puis enregistrez.`;
      return `/crm/clients/${client.id}?etape=lost#suivi`;
    }
    await ctx.payload.update({ collection: "clients", id: client.id, data: { pipeline: stage }, ...as(ctx) });
    message = `${client.name} : « ${prospectStageLabel(stage)} ».`;
    if (isActiveProspect(stage) && !(await plannedActions(ctx, client.id))) message += " Aucune action prévue : planifiez la suivante.";
  }, () => message);
}
export async function deleteActivity(data: FormData) {
  await run(data, "/crm/taches", async (ctx) => {
    await ctx.payload.delete({ collection: "crm-activities", id: id.parse(data.get("id")), ...as(ctx) });
  }, "Activité supprimée.");
}
// Turns a website contact request into a prospect (or attaches it to an existing
// company), with its contact person, an activity holding the message and,
// optionally, a first opportunity. The request itself is never modified.
export async function convertRequest(data: FormData) {
  await run(data, "/crm/demandes", async (ctx) => {
    const request = await ctx.payload.findByID({
      collection: "contact-requests",
      id: id.parse(data.get("request")),
      depth: 0,
      ...as(ctx),
    });
    // Converted = an activity already points at this request.
    const already = await ctx.payload.find({
      collection: "crm-activities",
      where: { request: { equals: request.id } },
      limit: 1,
      depth: 0,
      ...as(ctx),
    });
    if (already.docs[0]) return `/crm/clients/${relationID(already.docs[0].client)}`;
    const target = optionalID.parse(data.get("client"));
    const client = target
      ? await ctx.payload.findByID({ collection: "clients", id: target, depth: 0, ...as(ctx) })
      : await ctx.payload.create({
          collection: "clients",
          data: {
            name: (request.company || request.name).slice(0, 160),
            stage: "prospect",
            pipeline: "engaged",
            source: "site-web",
            sourceRequest: request.id,
            // Le sujet choisi par le visiteur est le premier besoin connu de l'entreprise.
            // topic est stocké en texte libre : on ne garde que les sujets connus.
            needs: knownNeed(request.topic),
            email: request.company ? null : request.email,
            phone: request.company ? null : request.phone || null,
            owner: ctx.user.id as number,
          },
          ...as(ctx),
        });
    // Entreprise existante : le sujet de la demande complète ses besoins connus, sans
    // jamais remplacer ceux déjà saisis.
    const known = (client.needs ?? []) as string[];
    const added = knownNeed(request.topic).filter((n) => !known.includes(n));
    if (target && added.length)
      await ctx.payload.update({
        collection: "clients",
        id: client.id,
        data: { needs: [...known, ...added] as typeof client.needs },
        ...as(ctx),
      });
    const existing = await ctx.payload.find({
      collection: "crm-contacts",
      where: { client: { equals: client.id }, email: { equals: request.email.toLowerCase() } },
      limit: 1,
      depth: 0,
      ...as(ctx),
    });
    const contact =
      existing.docs[0] ??
      (await ctx.payload.create({
        collection: "crm-contacts",
        data: { client: client.id, name: request.name, email: request.email, phone: request.phone || null, primary: !target },
        ...as(ctx),
      }));
    let deal: number | null = null;
    if (checkbox.parse(data.get("deal"))) {
      deal = (
        await ctx.payload.create({
          collection: "crm-deals",
          data: { title: `${topicLabel(request.topic)} — ${client.name}`.slice(0, 160), client: client.id, contact: contact.id, stage: "lead", owner: ctx.user.id as number },
          ...as(ctx),
        })
      ).id;
    }
    await ctx.payload.create({
      collection: "crm-activities",
      data: {
        kind: "email",
        subject: "Demande reçue via le formulaire du site",
        details: request.message,
        client: client.id,
        contact: contact.id,
        deal,
        request: request.id,
        done: true,
      },
      ...as(ctx),
    });
    // The company wrote to us: the exchange is engaged, and answering it is the next action.
    if (target && ["to-contact", "contacted", "on-hold"].includes(prospectStageOf(client.pipeline)))
      await ctx.payload.update({ collection: "clients", id: client.id, data: { pipeline: "engaged" }, ...as(ctx) });
    await ctx.payload.create({
      collection: "crm-activities",
      data: {
        kind: "call",
        subject: `Répondre à la demande de ${request.name}`.slice(0, 200),
        client: client.id,
        contact: contact.id,
        deal,
        dueAt: new Date().toISOString(),
        assignee: ctx.user.id as number,
        done: false,
      },
      ...as(ctx),
    });
    return `/crm/clients/${client.id}`;
  }, "Demande convertie : entreprise, contact et historique créés.");
}

// Quotes, invoices and credit notes. Lines come as line-<n>-<field>; empty rows are ignored.
const signedNumber = (max: number) =>
  z.preprocess((v) => (v === "" || v == null ? null : String(v).replace(/[\s\u202f\u00a0]/g, "").replace(",", ".")),
    z.coerce.number().min(-max).max(max).nullable());
const lineSchema = z.object({
  description: z.string().trim().min(1, "Chaque ligne remplie doit avoir une désignation.").max(1000),
  quantity: optionalNumber(1e6).transform((v) => v ?? 1),
  unit: text(20),
  unitPrice: signedNumber(1e12).transform((v) => v ?? 0),
  vatRate: optionalNumber(100),
});
function documentLines(data: FormData, fallbackRate: number) {
  const lines = [];
  for (let n = 0; n < 60; n++) {
    const get = (f: string) => data.get(`line-${n}-${f}`);
    if (![get("description"), get("unitPrice")].some((v) => typeof v === "string" && v.trim())) continue;
    const line = lineSchema.parse({ description: get("description") ?? "", quantity: get("quantity"), unit: get("unit"), unitPrice: get("unitPrice"), vatRate: get("vatRate") });
    lines.push({ ...line, vatRate: line.vatRate ?? fallbackRate });
  }
  return lines;
}
const documentSchema = z.object({
  title: z.string().trim().min(1, "Objet requis.").max(200),
  client: optionalID,
  contact: optionalID,
  deal: optionalID,
  validUntil: optionalDate,
  dueDate: optionalDate,
  vatRate: optionalNumber(100).transform((v) => v ?? defaultVatRate),
  conditions: text(3000),
  notes: text(5000),
});
export async function saveDocument(data: FormData) {
  await run(data, "/crm/documents", async (ctx) => {
    const parsed = documentSchema.parse(form(data));
    const { client, ...rest } = parsed;
    const fields = { ...rest, ...(client ? { client } : {}), lines: documentLines(data, parsed.vatRate) };
    const existing = optionalID.parse(data.get("id"));
    if (existing) {
      await ctx.payload.update({ collection: "crm-documents", id: existing, data: fields, ...as(ctx) });
      return `/crm/documents/${existing}`;
    }
    if (!client) throw new UserError("Choisissez l’entreprise.");
    const kind = z.enum(["quote", "invoice"]).parse(data.get("kind"));
    const doc = await ctx.payload.create({ collection: "crm-documents", data: { ...fields, client, kind, status: "draft" }, ...as(ctx) });
    return `/crm/documents/${doc.id}`;
  }, "Document enregistré.");
}
const statusValues = [...new Set([...quoteStatuses, ...invoiceStatuses, ...creditStatuses].map(([v]) => v))] as [string, ...string[]];
// A refused action on a document returns to that document, not to the list.
const docPage = (data: FormData) => {
  const n = Number(data.get("id"));
  return Number.isInteger(n) && n > 0 ? `/crm/documents/${n}` : "/crm/documents";
};
export async function setDocumentStatus(data: FormData) {
  await run(data, docPage(data), async (ctx) => {
    const doc = id.parse(data.get("id"));
    const status = z.enum(statusValues).parse(data.get("status"));
    await ctx.payload.update({ collection: "crm-documents", id: doc, data: { status: status as "draft" }, ...as(ctx) });
    return `/crm/documents/${doc}`;
  }, "Statut mis à jour.");
}
// Payments (partial or full) on an issued invoice; the balance and "Soldée" follow.
const paymentSchema = z.object({
  amount: optionalNumber(1e13).refine((v) => v != null && v > 0, "Montant du paiement requis."),
  date: optionalDate.refine((v) => !!v, "Date du paiement requise."),
  note: text(200),
});
export async function addPayment(data: FormData) {
  await run(data, docPage(data), async (ctx) => {
    const docID = id.parse(data.get("id"));
    const doc = await ctx.payload.findByID({ collection: "crm-documents", id: docID, depth: 0, ...as(ctx) });
    const payment = data.get("settle") === "1"
      ? { amount: doc.balance ?? 0, date: new Date().toISOString(), note: text(200).parse(data.get("note")) }
      : paymentSchema.parse(form(data));
    if (!(Number(payment.amount) > 0)) throw new UserError("Rien à encaisser sur cette facture.");
    await ctx.payload.update({
      collection: "crm-documents",
      id: docID,
      data: { payments: [...(doc.payments ?? []).map(({ date, amount, note }) => ({ date, amount, note })), payment as { amount: number; date: string; note: string | null }] },
      ...as(ctx),
    });
    return `/crm/documents/${docID}`;
  }, "Paiement enregistré.");
}
export async function deletePayment(data: FormData) {
  await run(data, docPage(data), async (ctx) => {
    const docID = id.parse(data.get("id"));
    const payment = z.string().min(1).max(64).parse(data.get("payment"));
    const doc = await ctx.payload.findByID({ collection: "crm-documents", id: docID, depth: 0, ...as(ctx) });
    await ctx.payload.update({
      collection: "crm-documents",
      id: docID,
      data: { payments: (doc.payments ?? []).filter((p) => p.id !== payment).map(({ date, amount, note }) => ({ date, amount, note })) },
      ...as(ctx),
    });
    return `/crm/documents/${docID}`;
  }, "Paiement supprimé.");
}
const fromQuote = (quote: { title: string; client: unknown; contact?: unknown; deal?: unknown; id: number; conditions?: string | null; vatRate?: number | null }) => ({
  title: quote.title, client: relationID(quote.client) as number, contact: relationID(quote.contact) as number | null,
  deal: relationID(quote.deal) as number | null, sourceQuote: quote.id, conditions: quote.conditions, vatRate: quote.vatRate,
});
const in30Days = () => {
  const due = new Date(Date.now() + 30 * 86400000);
  return new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())).toISOString();
};
async function numberedQuote(ctx: CRMContext, data: FormData) {
  const quote = await ctx.payload.findByID({ collection: "crm-documents", id: id.parse(data.get("id")), depth: 0, ...as(ctx) });
  if (quote.kind !== "quote") throw new UserError("Cette action part d’un devis.");
  if (!quote.number || quote.status === "refused") throw new UserError("Le devis doit être envoyé ou accepté.");
  return quote;
}
// Deposit invoice: a share of the quote, one line per VAT rate.
export async function depositFromQuote(data: FormData) {
  await run(data, docPage(data), async (ctx) => {
    const quote = await numberedQuote(ctx, data);
    const percent = z.coerce.number().min(1, "Pourcentage entre 1 et 99.").max(99, "Pourcentage entre 1 et 99.").parse(data.get("percent"));
    const invoice = await ctx.payload.create({
      collection: "crm-documents",
      data: {
        ...fromQuote(quote), kind: "invoice", invoiceType: "deposit", status: "draft", dueDate: in30Days(),
        title: `Acompte — ${quote.title}`.slice(0, 200),
        lines: depositLines(quote.lines ?? [], percent, quote.number!, quote.vatRate),
      },
      ...as(ctx),
    });
    return `/crm/documents/${invoice.id}`;
  }, "Facture d’acompte créée en brouillon.");
}
// Final invoice: the quote's lines, minus every issued deposit invoice of that quote.
export async function invoiceFromQuote(data: FormData) {
  await run(data, docPage(data), async (ctx) => {
    const quote = await numberedQuote(ctx, data);
    const related = await ctx.payload.find({
      collection: "crm-documents", where: { sourceQuote: { equals: quote.id }, kind: { equals: "invoice" } }, pagination: false, depth: 0, ...as(ctx),
    });
    const final = related.docs.find((d) => d.invoiceType !== "deposit" && d.status !== "cancelled");
    if (final) return `/crm/documents/${final.id}`;
    const deposits = related.docs.filter((d) => d.invoiceType === "deposit" && d.number && d.status !== "cancelled");
    if (related.docs.some((d) => d.invoiceType === "deposit" && !d.number))
      throw new UserError("Une facture d’acompte de ce devis est encore en brouillon : émettez-la ou supprimez-la d’abord.");
    const deductions = deposits.flatMap((d) =>
      (d.lines ?? []).map((l) => ({
        description: `Déduction de l’acompte ${d.number}${(d.lines ?? []).length > 1 ? ` (TVA ${l.vatRate ?? d.vatRate} %)` : ""}`,
        quantity: 1, unit: null, unitPrice: -Math.round((l.quantity ?? 1) * (l.unitPrice ?? 0)), vatRate: l.vatRate ?? d.vatRate ?? defaultVatRate,
      })),
    );
    const invoice = await ctx.payload.create({
      collection: "crm-documents",
      data: {
        ...fromQuote(quote), kind: "invoice", invoiceType: "standard", status: "draft", dueDate: in30Days(),
        lines: [
          ...(quote.lines ?? []).map(({ description, quantity, unit, unitPrice, vatRate }) => ({ description, quantity, unit, unitPrice, vatRate: vatRate ?? quote.vatRate })),
          ...deductions,
        ],
      },
      ...as(ctx),
    });
    return `/crm/documents/${invoice.id}`;
  }, "Facture créée en brouillon à partir du devis.");
}
// Credit note for an issued invoice: starts as a full copy, to reduce for a partial credit.
export async function creditFromInvoice(data: FormData) {
  await run(data, docPage(data), async (ctx) => {
    const invoice = await ctx.payload.findByID({ collection: "crm-documents", id: id.parse(data.get("id")), depth: 0, ...as(ctx) });
    if (invoice.kind !== "invoice" || !invoice.number || invoice.status === "cancelled")
      throw new UserError("Un avoir porte sur une facture émise et non annulée.");
    const credit = await ctx.payload.create({
      collection: "crm-documents",
      data: {
        kind: "credit", status: "draft", creditFor: invoice.id, client: relationID(invoice.client) as number,
        contact: relationID(invoice.contact) as number | null, deal: relationID(invoice.deal) as number | null,
        title: `Avoir sur la facture ${invoice.number}`, vatRate: invoice.vatRate,
        lines: (invoice.lines ?? []).filter((l) => (l.unitPrice ?? 0) >= 0)
          .map(({ description, quantity, unit, unitPrice, vatRate }) => ({ description, quantity, unit, unitPrice, vatRate: vatRate ?? invoice.vatRate })),
      },
      ...as(ctx),
    });
    return `/crm/documents/${credit.id}`;
  }, "Avoir créé en brouillon : ajustez les lignes pour un avoir partiel, puis émettez-le.");
}
export async function deleteDocument(data: FormData) {
  await run(data, "/crm/documents", async (ctx) => {
    await ctx.payload.delete({ collection: "crm-documents", id: id.parse(data.get("id")), ...as(ctx) });
    return "/crm/documents";
  }, "Brouillon supprimé.");
}
// E-mail the numbered document as a PDF (production only, CRM_EMAIL_ENABLED).
const mailSchema = z.object({
  to: z.email("Adresse email du destinataire invalide.").max(150).transform((v) => v.toLowerCase()),
  subject: z.string().trim().min(1, "Objet de l’email requis.").max(180),
  message: z.string().trim().min(1, "Message requis.").max(5000),
});
export async function emailDocument(data: FormData) {
  await run(data, docPage(data), async (ctx) => {
    if (!ctx.full) throw new UserError("Envoi des documents réservé à un administrateur complet.");
    if (!crmEmailEnabled()) throw new UserError("L’envoi d’emails n’est pas activé sur ce serveur : téléchargez le PDF et envoyez-le vous-même.");
    const docID = id.parse(data.get("id"));
    const mail = mailSchema.parse(form(data));
    const doc = await ctx.payload.findByID({ collection: "crm-documents", id: docID, depth: 1, ...as(ctx) });
    if (!doc.number) throw new UserError("Émettez ou envoyez d’abord le document : un brouillon ne part pas par email.");
    const credited = doc.creditFor && typeof doc.creditFor === "object" ? doc.creditFor.number : null;
    const pdf = await documentPDF(doc, await contactDetails(), credited);
    let transport: ReturnType<typeof contactSMTPTransport>;
    try { transport = contactSMTPTransport(); } catch { throw new UserError("Configuration SMTP indisponible : aucun email envoyé."); }
    const state = await sendDocumentMail(database(), {
      documentID: docID, to: mail.to, subject: mail.subject, text: mail.message, pdf, filename: documentFilename(doc),
      replyTo: String(ctx.user.email), sentBy: Number(ctx.user.id),
    }, (m) => transport.sendMail(m));
    transport.close();
    if (state !== "accepted")
      throw new UserError(state === "failed"
        ? "Le serveur de messagerie a refusé ce destinataire : email non envoyé."
        : "Envoi incertain (coupure pendant l’échange avec le serveur). Vérifiez auprès du destinataire avant de renvoyer.");
    const contact = relationID(doc.contact);
    await ctx.payload.create({
      collection: "crm-activities",
      data: {
        kind: "email", subject: `${documentKindLabel(doc.kind, doc.invoiceType)} ${doc.number} envoyé(e) à ${mail.to}`.slice(0, 200),
        details: `Objet : ${mail.subject}\nMontant TTC : ${money(doc.total)}\n\n${mail.message}`.slice(0, 10000),
        client: relationID(doc.client) as number, deal: relationID(doc.deal) as number | null, contact: contact as number | null, done: true,
      },
      ...as(ctx),
    });
    return `/crm/documents/${docID}`;
  }, "Email accepté par le serveur de messagerie (copie cachée envoyée à votre adresse).");
}
