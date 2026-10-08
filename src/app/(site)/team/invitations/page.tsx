import { identity } from "@/lib/backend";
import { isAdmin } from "@/lib/access";
import { notFound } from "next/navigation";
import { TeamInviteForm } from "@/components/TeamInviteForm";
export const dynamic = "force-dynamic";
export default async function Invite() {
  const { payload, user } = await identity();
  if (!isAdmin(user)) notFound();
  const clients = await payload.find({
    collection: "clients",
    user,
    overrideAccess: false,
    limit: 100,
    depth: 0,
  });
  return (
    <main id="contenu" className="container support-shell">
      <a href="/admin">← Administration</a>
      <h1>Inviter un client</h1>
      <p>
        Créez d’abord son organisation dans l’administration. Le compte restera
        désactivé jusqu’à la définition du mot de passe par le client. Aucun
        e-mail n’est envoyé automatiquement.
      </p>
      <TeamInviteForm
        clients={clients.docs.map((c) => ({ id: c.id, name: c.name }))}
      />
    </main>
  );
}
