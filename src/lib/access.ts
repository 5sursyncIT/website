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
export function isAdmin(user: Identity) {
  return !!user && user.collection === "admins";
}
export function clientID(user: Identity) {
  return user?.collection === "client-accounts" && user.enabled === true
    ? relationID(user.client)
    : null;
}
export function owns(user: Identity, record: { client?: unknown }) {
  const id = clientID(user);
  return (
    isAdmin(user) ||
    (id !== null && String(id) === String(relationID(record.client)))
  );
}
export const adminOnly: Access = ({ req }) => isAdmin(req.user);
export const tenantRead: Access = ({ req }) => {
  if (isAdmin(req.user)) return true;
  const id = clientID(req.user);
  return id !== null ? { client: { equals: id } } : false;
};
export const clientOrAdmin: Access = ({ req }) =>
  isAdmin(req.user) || clientID(req.user) !== null;
