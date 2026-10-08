import { z } from "zod";
import { clientSources, clientStages } from "@/lib/crm";
// Form rules shared by the server actions and the CSV import: a company imported
// from a file is validated exactly like one typed in /crm/clients/nouveau.
export const values = <T extends readonly (readonly [string, ...unknown[]])[]>(list: T) =>
  list.map(([v]) => v) as unknown as [T[number][0], ...T[number][0][]];
export const text = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
export const id = z.coerce.number().int().positive();
export const optionalID = z.preprocess((v) => (v === "" || v == null ? null : v), id.nullable());
export const optionalEmail = z.preprocess((v) => (v === "" ? null : v), z.email("Email invalide.").max(150).nullish()).transform((v) => v?.toLowerCase() ?? null);
export const website = z.preprocess(
  (v) => (typeof v === "string" && v.trim() && !/^https?:\/\//i.test(v.trim()) ? "https://" + v.trim() : v),
  text(200).refine((v) => !v || /^https?:\/\/[^\s/@]+\.[^\s@]+$/i.test(v), "Site web invalide."),
);
export const clientSchema = z.object({
  name: z.string().trim().min(1, "Nom de l’entreprise requis.").max(160),
  stage: z.enum(values(clientStages)),
  source: z.preprocess((v) => v || null, z.enum(values(clientSources)).nullable()),
  owner: optionalID,
  sector: text(80),
  registration: text(80),
  email: optionalEmail,
  phone: text(40),
  website,
  address: text(200),
  city: text(80),
  country: text(60),
  notes: text(5000),
});
export type ClientFields = z.infer<typeof clientSchema>;
