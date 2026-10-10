// Shared by the public contact form, ticket categories and the admin labels.
export const topics = [
  ["reseaux-cloud", "Réseaux et cloud"],
  ["solutions-metier", "Solutions métier"],
  ["developpement-api", "Développement et API"],
  ["maintenance-support", "Maintenance et support"],
  ["autre", "Autre besoin"],
] as const;
export function topicLabel(value: unknown) {
  return topics.find(([v]) => v === value)?.[1] ?? String(value ?? "");
}
// The four service pages, each mapped to the need it preselects in the contact form.
// Used by the service CTAs (/contact?service=…), by the form and by the CRM, so the
// request records which page the visitor was reading.
export const services = [
  ["reseaux-cloud", "Réseaux et cloud", "reseaux-cloud"],
  ["solutions-metier", "Solutions métier", "solutions-metier"],
  ["developpement-api", "Développement et API", "developpement-api"],
  ["maintenance-support", "Maintenance et support", "maintenance-support"],
] as const;
export type ServiceSlug = (typeof services)[number][0];
export const serviceValues = services.map(([v]) => v) as readonly string[];
export const serviceLabel = (value: unknown) =>
  services.find(([v]) => v === value)?.[1] ?? "";
// Need preselected in the form for a given service page.
export const serviceTopic = (value: unknown) =>
  services.find(([v]) => v === value)?.[2] ?? "";
