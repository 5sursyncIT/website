import { z } from "zod";
import { clientSources, clientStages, normalizeSearch, type ClientStage } from "@/lib/crm";
import { clientSchema, type ClientFields } from "@/lib/crm-schema";
// CSV import of companies (/crm/clients/importer). Pure functions: parsing, column
// mapping, validation and duplicate detection, so the preview and the import itself
// decide exactly the same thing. Writing is done by the importClients server action.
export const IMPORT_MAX_BYTES = 512 * 1024;
export const IMPORT_MAX_ROWS = 2000;
// The commercial stage is not imported: it follows the exchanges (a loss needs its reason).
// Needs are not imported either: they are recorded from the exchanges and from converted
// website requests, not from a spreadsheet column.
export type ImportField = Exclude<keyof ClientFields, "owner" | "pipeline" | "lostReason" | "needs" | "needsDetail">;
export type DuplicateMode = "skip" | "complete";
export type ImportOptions = { defaultStage: ClientStage; duplicates: DuplicateMode };
// Accepted headers, compared without accents, case or punctuation. The CRM's own
// export (/crm/export/clients) re-imports as is; « Étape commerciale », « Raison de la perte »,
// « Prochaine action », « Responsable » and « Créée le » are ignored.
const headers: Record<ImportField, string[]> = {
  name: ["entreprise", "nom", "nom de l entreprise", "societe", "raison sociale", "organisation", "organization", "company", "name"],
  stage: ["statut", "statut commercial", "stage", "status"],
  source: ["origine", "source"],
  sector: ["secteur", "secteur d activite", "activite", "sector", "industry"],
  registration: ["ninea rccm", "ninea", "rccm", "registration"],
  email: ["email", "e mail", "courriel", "mail", "adresse email"],
  phone: ["telephone", "tel", "phone", "mobile", "numero"],
  website: ["site web", "site", "site internet", "website", "url", "web"],
  address: ["adresse", "address"],
  city: ["ville", "city", "localite"],
  country: ["pays", "country"],
  notes: ["notes", "note", "commentaire", "commentaires", "remarques", "observations"],
};
export const fieldLabels: Record<ImportField, string> = {
  name: "Entreprise", stage: "Statut", source: "Origine", sector: "Secteur", registration: "NINEA/RCCM",
  email: "Email", phone: "Téléphone", website: "Site web", address: "Adresse", city: "Ville", country: "Pays", notes: "Notes",
};
const key = (value: string) => normalizeSearch(value).replace(/[^a-z0-9]+/g, " ").trim();
const headerIndex = new Map(Object.entries(headers).flatMap(([field, names]) => names.map((n) => [n, field as ImportField])));

// Bytes → text: UTF-8 (with or without BOM), else Windows-1252, the encoding Excel
// uses for « CSV (séparateur : point-virgule) » on a French Windows.
export function decodeCSV(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
// RFC 4180 with the separator guessed from the header line (; , or tab). Quoted cells
// may contain separators, quotes ("") and line breaks. Each record keeps its line number.
export function parseCSV(input: string) {
  const textIn = input.replace(/^﻿/, "");
  const firstLine = textIn.split(/\r?\n/, 1)[0].replace(/"[^"]*"/g, "");
  // Most frequent candidate in the header; « ; » when there is a single column.
  const [sep] = [";", ",", "\t"]
    .map((s) => [s, firstLine.split(s).length - 1] as const)
    .reduce((a, b) => (b[1] > a[1] ? b : a));
  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let start = 1;
  const endRecord = () => {
    cells.push(cell);
    if (cells.some((c) => c.trim() !== "")) records.push({ line: start, cells });
    cells = [];
    cell = "";
  };
  for (let i = 0; i < textIn.length; i++) {
    const ch = textIn[i];
    if (quoted) {
      if (ch === '"' && textIn[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else { if (ch === "\n") line++; cell += ch; }
    } else if (ch === '"' && cell.trim() === "") { cell = ""; quoted = true; }
    else if (ch === sep) { cells.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && textIn[i + 1] === "\n") i++;
      endRecord();
      line++;
      start = line;
    } else cell += ch;
  }
  if (cell !== "" || cells.length) endRecord();
  return { separator: sep, records };
}
// Cells written by our export start with ' when they began with = + - @ (formula
// neutralisation): the apostrophe is removed so the value round-trips unchanged.
export const cleanCell = (value: string | undefined) => {
  const v = (value ?? "").trim();
  return /^'[=+\-@\t\r]/.test(v) ? v.slice(1) : v;
};
export function mapColumns(header: string[]) {
  const fields: (ImportField | null)[] = [];
  const ignored: string[] = [];
  const seen = new Set<ImportField>();
  const errors: string[] = [];
  for (const raw of header) {
    const field = headerIndex.get(key(cleanCell(raw))) ?? null;
    if (field && seen.has(field)) {
      errors.push(`Colonne en double pour « ${fieldLabels[field]} » : ${raw.trim()}.`);
      fields.push(null);
      continue;
    }
    if (field) seen.add(field);
    else if (raw.trim()) ignored.push(raw.trim());
    fields.push(field);
  }
  if (!seen.has("name")) errors.push("Colonne « Entreprise » (ou « Nom ») introuvable dans la première ligne.");
  return { fields, ignored, errors, mapped: [...seen] };
}
// A select value given as its code or its French label (« Ancien client », « Prospection directe »).
function choice(list: readonly (readonly [string, string, ...unknown[]])[], value: string) {
  const k = key(value);
  return list.find(([v, label]) => key(v) === k || key(label) === k)?.[0];
}
export const nameKey = (v: string | null | undefined) => (v ? key(v) : "");
export const siteKey = (v: string | null | undefined) =>
  v ? v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "") : "";
export type ExistingClient = Partial<Record<ImportField, string | null>> & { id: number; name: string };
export type PlannedRow = {
  line: number;
  name: string;
  action: "create" | "complete" | "skip" | "error";
  reason?: string;
  data?: Omit<ClientFields, "owner" | "pipeline" | "lostReason">;
  target?: { id: number; name: string };
  fill?: Partial<Pick<ClientFields, FillField>>;
};
// Fields an existing company may receive; never its name or commercial status.
const fillable = ["source", "sector", "registration", "email", "phone", "website", "address", "city", "country", "notes"] as const;
type FillField = (typeof fillable)[number];
export function planImport(input: string, existing: ExistingClient[], options: ImportOptions) {
  const { records, separator } = parseCSV(input);
  const fail = (message: string) => ({ separator, errors: [message], ignored: [] as string[], mapped: [] as ImportField[], rows: [] as PlannedRow[], counts: count([]) });
  if (!records.length) return fail("Le fichier est vide.");
  const [head, ...body] = records;
  const columns = mapColumns(head.cells);
  if (columns.errors.length) return { ...fail(columns.errors[0]), errors: columns.errors, ignored: columns.ignored };
  if (!body.length) return { ...fail("Aucune ligne d’entreprise sous l’en-tête."), ignored: columns.ignored, mapped: columns.mapped };
  if (body.length > IMPORT_MAX_ROWS) return fail(`Trop de lignes : ${body.length} (maximum ${IMPORT_MAX_ROWS} par import).`);
  // Duplicates: same name (accents and case ignored), same email or same website.
  const byName = new Map<string, ExistingClient>();
  const byEmail = new Map<string, ExistingClient>();
  const bySite = new Map<string, ExistingClient>();
  for (const c of existing) {
    if (nameKey(c.name)) byName.set(nameKey(c.name), c);
    if (c.email) byEmail.set(c.email.toLowerCase(), c);
    if (siteKey(c.website)) bySite.set(siteKey(c.website), c);
  }
  const inFile = new Map<string, number>();
  const rows: PlannedRow[] = body.map(({ line, cells }) => {
    const raw: Partial<Record<ImportField, string>> = {};
    columns.fields.forEach((field, i) => { if (field) raw[field] = cleanCell(cells[i]); });
    const name = raw.name ?? "";
    const problems: string[] = [];
    if (cells.length > columns.fields.length && cells.slice(columns.fields.length).some((c) => c.trim()))
      problems.push("plus de cellules que de colonnes (séparateur ou guillemet mal placé ?)");
    const stage = raw.stage ? choice(clientStages, raw.stage) : options.defaultStage;
    if (raw.stage && !stage) problems.push(`statut « ${raw.stage} » inconnu (Prospect, Client ou Ancien client)`);
    const source = raw.source ? choice(clientSources, raw.source) : null;
    if (raw.source && !source) problems.push(`origine « ${raw.source} » inconnue`);
    const parsed = clientSchema.omit({ owner: true, pipeline: true, lostReason: true }).safeParse({ ...raw, stage: stage ?? options.defaultStage, source });
    if (!parsed.success)
      problems.push(...parsed.error.issues.map((i) => {
        const label = fieldLabels[i.path[0] as ImportField] ?? "Champ";
        // « Email invalide. » already names its field; « Trop long » does not.
        return i.message.toLowerCase().startsWith(label.toLowerCase()) ? i.message : `${label} : ${i.message}`;
      }));
    if (problems.length || !parsed.success) return { line, name, action: "error", reason: problems.join(" ; ") };
    const data = parsed.data;
    const keys = [`n:${nameKey(data.name)}`, data.email && `e:${data.email}`, siteKey(data.website) && `s:${siteKey(data.website)}`].filter(Boolean) as string[];
    const earlier = keys.map((k) => inFile.get(k)).find((l) => l !== undefined);
    if (earlier !== undefined) return { line, name: data.name, action: "error", reason: `doublon de la ligne ${earlier} du fichier` };
    keys.forEach((k) => inFile.set(k, line));
    const match = byName.get(nameKey(data.name)) ?? (data.email ? byEmail.get(data.email) : undefined) ?? (siteKey(data.website) ? bySite.get(siteKey(data.website)) : undefined);
    if (!match) return { line, name: data.name, action: "create", data };
    const target = { id: match.id, name: match.name };
    if (options.duplicates === "skip") return { line, name: data.name, action: "skip", target, reason: `existe déjà (${match.name})` };
    // Completion never overwrites: only the existing company's empty fields are filled.
    const fill: Partial<Pick<ClientFields, FillField>> = {};
    for (const f of fillable) {
      const value = data[f];
      if (value && !match[f]) Object.assign(fill, { [f]: value });
    }
    return Object.keys(fill).length
      ? { line, name: data.name, action: "complete", target, fill }
      : { line, name: data.name, action: "skip", target, reason: `existe déjà (${match.name}), rien à compléter` };
  });
  return { separator, errors: [] as string[], ignored: columns.ignored, mapped: columns.mapped, rows, counts: count(rows) };
}
function count(rows: PlannedRow[]) {
  const n = (a: PlannedRow["action"]) => rows.filter((r) => r.action === a).length;
  return { total: rows.length, create: n("create"), complete: n("complete"), skip: n("skip"), error: n("error") };
}
export const importOptionsSchema = z.object({
  defaultStage: z.enum(["prospect", "client", "inactive"]).catch("prospect"),
  duplicates: z.enum(["skip", "complete"]).catch("skip"),
});
// Template offered for download: the export's columns, one example row.
export const templateRows = [
  ["Entreprise", "Statut", "Origine", "Secteur", "NINEA/RCCM", "Email", "Téléphone", "Site web", "Adresse", "Ville", "Pays", "Notes"],
  ["Exemple SARL", "Prospect", "Prospection directe", "Distribution", "", "contact@exemple.sn", "+221 33 000 00 00", "https://exemple.sn", "Rue 10, Point E", "Dakar", "Sénégal", "Ligne d’exemple : à supprimer"],
];
