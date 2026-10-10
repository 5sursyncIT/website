import type { Access } from "payload";
export type Identity =
  | {
      id: string | number;
      collection?: string;
      enabled?: boolean | null;
      client?: unknown;
    }
  | null
  | undefined;
export function relationID(value: unknown): string | number | null {
  if (typeof value === "string" || typeof value === "number") return value;
  if (value && typeof value === "object" && "id" in value)
    return relationID(value.id);
  return null;
}
// Any team account (collection admins), whatever its profile. Profiles (admins.role):
// full = everything; crm = /crm only; technician = Support tickets only (in /admin).
export function isAdmin(user: Identity) {
  return !!user && user.collection === "admins";
}
export const staffRoles = [
  ["full", "Administrateur complet"],
  ["crm", "CRM uniquement (assistante commerciale)"],
  ["technician", "Technicien : tickets Support uniquement"],
] as const;
export type StaffRole = (typeof staffRoles)[number][0];
// Unknown or missing profile = no right at all (fails closed).
export function staffRole(user: Identity): StaffRole | null {
  if (!isAdmin(user)) return null;
  const role = (user as { role?: unknown }).role;
  return staffRoles.some(([v]) => v === role) ? (role as StaffRole) : null;
}
export const isFullAdmin = (user: Identity) => staffRole(user) === "full";
export const canUseCRM = (user: Identity) => ["full", "crm"].includes(staffRole(user) ?? "");
export const isTicketStaff = (user: Identity) => ["full", "technician"].includes(staffRole(user) ?? "");
export function clientID(user: Identity) {
  return user?.collection === "client-accounts" && user.enabled === true
    ? relationID(user.client)
    : null;
}
export function owns(user: Identity, record: { client?: unknown }) {
  const id = clientID(user);
  return (
    isTicketStaff(user) ||
    (id !== null && String(id) === String(relationID(record.client)))
  );
}
// Site content, accounts, invitations, settings: full administrators only.
export const adminOnly: Access = ({ req }) => isFullAdmin(req.user);
export const crmOnly: Access = ({ req }) => canUseCRM(req.user);
export const ticketStaffOnly: Access = ({ req }) => isTicketStaff(req.user);
// Support data: the ticket team sees everything, a client account its company only.
export const tenantRead: Access = ({ req }) => {
  if (isTicketStaff(req.user)) return true;
  const id = clientID(req.user);
  return id !== null ? { client: { equals: id } } : false;
};
export const clientOrAdmin: Access = ({ req }) =>
  isTicketStaff(req.user) || clientID(req.user) !== null;
