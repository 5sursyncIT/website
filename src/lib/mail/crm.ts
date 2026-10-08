import { cache } from "react";
import { crmContext } from "@/lib/crm-server";
import { database } from "@/lib/database";
import { mailLevel } from "./access";
import { mailStatus } from "./config";
import { mailDeps, type MailActor } from "./service";
// /crm pages and actions: the admin session (crmContext) + the mailbox right + the
// production-only dependencies (null in preproduction or without configuration).
export const mailContext = cache(async () => {
  const ctx = await crmContext();
  const actor: MailActor = { id: Number(ctx.user.id), level: mailLevel(ctx.user), channel: "crm" };
  const status = mailStatus();
  return { ctx, actor, deps: status.enabled ? mailDeps(database()) : null, reason: status.enabled ? null : status.reason };
});
export const mailUnavailable: Record<string, string> = {
  disabled: "Messagerie contact@ non activée sur cette instance (activation après configuration Microsoft, en production seulement).",
  origin: "La messagerie contact@ n’est active qu’en production.",
  configuration: "Messagerie contact@ : configuration Microsoft incomplète (voir documentation/microsoft365.md).",
  build: "Messagerie indisponible.",
};
