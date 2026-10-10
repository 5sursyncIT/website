import type { ServerProps } from "payload";
import { canUseCRM } from "@/lib/access";
// The CRM has its own interface (/crm); its collections are hidden from /admin.
// Not shown to technicians (no CRM access).
export function CrmNavLink({ user }: Partial<ServerProps>) {
  if (!canUseCRM(user)) return null;
  return (
    <a className="sync-nav-crm" href="/crm">
      <span>CRM clients</span>
      <small>Entreprises, opportunités, devis et factures, contacts, tâches</small>
    </a>
  );
}
