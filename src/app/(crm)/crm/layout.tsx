import Link from "next/link";
import { crmContext } from "@/lib/crm-server";
import { CRMNav } from "@/components/crm/client";
import { mailStatus } from "@/lib/mail/config";
import { certThreshold, daysLeft } from "@/lib/mail/worker";
export const dynamic = "force-dynamic";
// Microsoft certificates of the contact@ link: visible warning from 30 days before expiry.
function certBanner() {
  const status = mailStatus();
  if (!status.enabled) return null;
  const late = [status.config.read, status.config.send].filter((c) => certThreshold(c.notAfter) !== null);
  if (!late.length) return null;
  const left = Math.min(...late.map((c) => daysLeft(c.notAfter)));
  return (
    <p className="crm-flash crm-flash--error" role="alert">
      {left < 0 ? "Certificat Microsoft de la messagerie contact@ expiré : synchronisation et envoi arrêtés." : `Certificat Microsoft de la messagerie contact@ : expiration dans ${left} jour(s).`}{" "}
      Renouvellement : documentation/microsoft365.md, section 10.
    </p>
  );
}
export default async function CRMLayout({ children }: { children: React.ReactNode }) {
  const { user } = await crmContext();
  const name = "name" in user && typeof user.name === "string" ? user.name : "";
  return (
    <div className="crm-shell">
      <a className="crm-skip" href="#crm-main">Aller au contenu</a>
      <aside className="crm-side">
        <Link href="/crm" className="crm-brand">
          <img src="/favicon-5.png?v=20261007" alt="" width={32} height={32} />
          <span>
            <strong>5/Sync IT</strong>
            <small>CRM clients</small>
          </span>
        </Link>
        <form action="/crm/recherche" role="search" className="crm-search">
          <input name="q" type="search" placeholder="Rechercher…" aria-label="Rechercher dans le CRM" maxLength={80} />
        </form>
        <CRMNav />
        <div className="crm-side__foot">
          <span title={String(user.email ?? "")}>{name || String(user.email ?? "")}</span>
          <a href="/admin">Administration ↗</a>
        </div>
      </aside>
      <main id="crm-main" className="crm-main">
        {certBanner()}
        {children}
      </main>
    </div>
  );
}
