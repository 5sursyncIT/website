import { InvitationForm } from "@/components/InvitationForm";
export const metadata = { title: "Activer mon accès client" };
export default function Activate() {
  return (
    <main id="contenu" className="container support-shell">
      <h1>Activer mon accès</h1>
      <p>Choisissez votre mot de passe pour accéder au suivi de vos tickets.</p>
      <InvitationForm />
    </main>
  );
}
