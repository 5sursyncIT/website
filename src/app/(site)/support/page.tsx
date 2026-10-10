import Link from "next/link";
import { redirect } from "next/navigation";
import { identity } from "@/lib/backend";
import { clientID, isAdmin } from "@/lib/access";
import { Logout } from "@/components/SupportForms";
import { statusLabel } from "@/lib/support";
export const dynamic = "force-dynamic";
export const metadata = { title: "Mes tickets de support" };
export default async function Support() {
  const { payload, user } = await identity();
  if (!isAdmin(user) && clientID(user) === null) redirect("/support/connexion");
  const tickets = await payload.find({
    collection: "tickets",
    user,
    overrideAccess: false,
    depth: 0,
    sort: "-updatedAt",
    limit: 50,
  });
  return (
    <main id="contenu" className="container support-shell">
      <p className="eyebrow">Espace client</p>
      <h1>Mes tickets</h1>
      <div className="support-actions">
        {clientID(user) === null ? (
          // An administrator has no company of their own: a ticket opened here would be
          // refused by the API. Point straight at the administration instead.
          <a className="button aqua" href="/admin/collections/tickets/create">
            Créer un ticket dans l’administration ↗
          </a>
        ) : (
          <Link className="button aqua" href="/support/nouveau">
            Ouvrir un ticket ↗
          </Link>
        )}
        <Logout />
      </div>
      {tickets.docs.length ? (
        <ul>
          {tickets.docs.map((t) => (
            <li key={t.id}>
              <Link href={`/support/tickets/${t.id}`}>
                <h2>{t.subject}</h2>
                <p>
                  {statusLabel(t.status)} ·{" "}
                  {new Date(t.updatedAt).toLocaleDateString("fr-FR")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>Vous n’avez pas encore de ticket.</p>
      )}
      {tickets.hasNextPage && (
        <p>
          Seuls les 50 tickets les plus récents sont affichés. Contactez
          l’équipe pour les archives.
        </p>
      )}
    </main>
  );
}
