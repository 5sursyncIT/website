import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { identity } from "@/lib/backend";
import { isAdmin } from "@/lib/access";
// Every /crm page, server action and export goes through this guard: Payload admins
// only. Anonymous visitors are sent to the admin login, client accounts get a 404.
export const crmContext = cache(async () => {
  const context = await identity();
  if (!context.user) redirect("/admin/login?redirect=%2Fcrm");
  if (!isAdmin(context.user)) notFound();
  return { payload: context.payload, user: context.user };
});
export type CRMContext = Awaited<ReturnType<typeof crmContext>>;
// Local API calls always run with the admin's own permissions.
export const as = (ctx: CRMContext) => ({ user: ctx.user, overrideAccess: false as const });
const dakar = { timeZone: "Africa/Dakar" } as const;
export const formatDate = (value: unknown) =>
  value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", ...dakar }).format(new Date(String(value))) : "—";
export const formatDateTime = (value: unknown) =>
  value
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", ...dakar }).format(new Date(String(value)))
    : "—";
// Dakar is UTC+0 all year: <input type=date|datetime-local> values map directly to UTC.
export const dateInputValue = (value: unknown) => (value ? new Date(String(value)).toISOString().slice(0, 10) : "");
export const dateTimeInputValue = (value: unknown) => (value ? new Date(String(value)).toISOString().slice(0, 16) : "");
export function pageNumber(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 10000 ? n : 1;
}
export const searchText = (value: unknown) => (typeof value === "string" ? value.trim().slice(0, 80) : "");
export { safeBack, withMessage } from "@/lib/crm";
