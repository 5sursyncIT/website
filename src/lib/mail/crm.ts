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
  disabled: "Messagerie du CRM non activée sur cette instance (activation en production seulement, après configuration).",
  origin: "La messagerie du CRM n’est active qu’en production.",
  configuration: "Messagerie du CRM : configuration incomplète (voir documentation/messagerie-simafri.md).",
  build: "Messagerie indisponible.",
};
