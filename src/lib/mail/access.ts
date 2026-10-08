// Mailbox rights of an administrator (CRM ↔ contact@, documentation/microsoft365.md).
// Ordered levels: each one includes the previous ones.
export const mailLevels = [
  ["none", "Aucun accès à la messagerie"],
  ["read", "Lecture"],
  ["draft", "Lecture et brouillons"],
  ["send", "Lecture, brouillons et envoi"],
] as const;
export type MailLevel = (typeof mailLevels)[number][0];
const rank: Record<MailLevel, number> = { none: 0, read: 1, draft: 2, send: 3 };
export function mailLevel(user: unknown): MailLevel {
  const value = user && typeof user === "object" && "mailAccess" in user ? (user as { mailAccess?: unknown }).mailAccess : null;
  return typeof value === "string" && value in rank ? (value as MailLevel) : "none";
}
export const canMail = (user: unknown, need: Exclude<MailLevel, "none">) => rank[mailLevel(user)] >= rank[need];
export const mailLevelLabel = (level: string) => mailLevels.find(([v]) => v === level)?.[1] ?? level;

// Account administration is a separate right: holding "send" gives no power over accounts.
export const canManageAdmins = (user: unknown) =>
  !!user && typeof user === "object" && (user as { manageAdmins?: unknown }).manageAdmins === true;
// Rights fields (mailAccess, manageAdmins): set only by an account manager, never on their
// own account (no self-escalation, even through a direct API call).
export const canSetRights = (user: unknown, targetId: unknown) =>
  canManageAdmins(user) && (targetId == null || String((user as { id?: unknown }).id) !== String(targetId));
