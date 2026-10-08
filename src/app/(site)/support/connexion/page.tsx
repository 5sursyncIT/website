import { ActionForm } from "@/components/SupportForms";
export const metadata = { title: "Connexion au support" };
export default function Login() {
  return (
    <main id="contenu" className="container support-shell">
      <p className="eyebrow">Espace client</p>
      <h1>Votre support, au même endroit.</h1>
      <p>
        Connectez-vous pour ouvrir un ticket et suivre les réponses de notre
        équipe.
      </p>
      <p>
        Les comptes sont ouverts sur invitation. Pour demander un accès,{" "}
        <a className="text-link" href="/contact">
          contactez-nous
        </a>
        .
      </p>
      <ActionForm
        endpoint="/api/support/login"
        label="Se connecter"
        redirect="/support"
      >
        <label>
          E-mail
          <input type="email" name="email" autoComplete="username" required />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            maxLength={200}
          />
        </label>
      </ActionForm>
    </main>
  );
}
