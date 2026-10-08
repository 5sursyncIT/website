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
