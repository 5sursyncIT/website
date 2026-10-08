import { supportPageUser } from "@/lib/backend";
import { ActionForm } from "@/components/SupportForms";
export const dynamic = "force-dynamic";
export const metadata = { title: "Ouvrir un ticket" };
export default async function NewTicket() {
  await supportPageUser();
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
