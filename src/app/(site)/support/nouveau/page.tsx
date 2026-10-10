import { supportPageUser } from "@/lib/backend";
import { clientID } from "@/lib/access";
import { ActionForm } from "@/components/SupportForms";
export const dynamic = "force-dynamic";
export const metadata = { title: "Ouvrir un ticket" };
export default async function NewTicket() {
  const { user } = await supportPageUser();
  // A ticket always belongs to a client company: POST /api/support/tickets needs a client
  // account. An administrator signed in here has no company of their own, so the form
  // would be refused once filled in — say so up front and point to the administration.
  if (clientID(user) === null)
    return (
      <main id="contenu" className="container support-shell">
        <a href="/support">← Mes tickets</a>
        <h1>Ouvrir un ticket</h1>
        <p className="form-help">
          Vous êtes connecté avec un compte d’administration, qui n’est rattaché à aucune
          entreprise cliente. Un ticket est toujours ouvert au nom d’une entreprise.
        </p>
        <p>
          <a className="button aqua" href="/admin/collections/tickets/create">
            Créer le ticket dans l’administration ↗
          </a>
        </p>
        <p className="form-help">
          Choisissez l’entreprise concernée dans le formulaire de l’administration. Pour
          tester le parcours client, connectez-vous avec un compte client de l’espace Support.
        </p>
      </main>
    );
  return (
    <main id="contenu" className="container support-shell">
      <a href="/support">← Mes tickets</a>
      <h1>Ouvrir un ticket</h1>
      <ActionForm
        endpoint="/api/support/tickets"
        label="Créer le ticket"
        redirect="ticket"
      >
        <label>
          Sujet
          <input name="subject" required minLength={3} maxLength={180} />
        </label>
        <label>
          Domaine
          <select name="category" required>
            <option value="reseaux-cloud">Réseaux et cloud</option>
            <option value="solutions-metier">Solutions métier</option>
            <option value="developpement-api">Développement et API</option>
            <option value="maintenance-support">Maintenance et support</option>
            <option value="autre">Autre</option>
          </select>
        </label>
        <label>
          Décrivez le besoin
          <textarea
            name="description"
            required
            rows={8}
            minLength={10}
            maxLength={10000}
          />
        </label>
        <p className="form-help">
          Vous pourrez joindre des fichiers après la création. Ne transmettez
          pas de mot de passe.
        </p>
      </ActionForm>
    </main>
  );
}
