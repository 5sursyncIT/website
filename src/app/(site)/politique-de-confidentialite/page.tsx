import Link from "next/link";
import { pageMetadata } from "@/lib/page-meta";
import { contactDetails } from "@/lib/contact-details";
import { LEGAL } from "@/lib/legal";
export const revalidate = 300;
export function generateMetadata() {
  return pageMetadata("/politique-de-confidentialite", { title: "Politique de confidentialité | 5/Sync IT" });
}
export default async function Page() {
  const contact = await contactDetails();
  const mail = <a href={`mailto:${contact.email}`}>{contact.email}</a>;
  return (
    <main id="contenu" className="container legal-page">
      <p className="eyebrow">Données personnelles</p>
      <h1>Politique de confidentialité</h1>
      <p className="updated">Dernière mise à jour : {LEGAL.updated}</p>
      <p>
        Cette politique explique quelles données personnelles {LEGAL.name} collecte sur ce site,
        pourquoi, combien de temps elles sont conservées et comment exercer vos droits, conformément
        à la loi sénégalaise n° 2008-12 du 25 janvier 2008 sur la protection des données à caractère
        personnel.
      </p>

      <h2>Responsable du traitement</h2>
      <p>
        {LEGAL.name}, {LEGAL.form}, RCCM {LEGAL.rccm}, {LEGAL.seat(contact.address)}. Contact : {mail}.
      </p>

      <h2>Demandes de contact</h2>
      <p>
        Lorsque vous utilisez le formulaire de contact, nous recueillons votre nom, votre adresse
        e-mail et votre message (obligatoires), ainsi que, si vous les indiquez, le nom de votre
        entreprise, votre téléphone et le sujet de votre demande. Ces données servent uniquement à
        répondre à votre demande et à assurer le suivi de nos échanges. Elles sont enregistrées sur
        notre serveur et une notification est transmise à notre messagerie professionnelle. Elles
        sont conservées {LEGAL.contactRetention}, sauf si une relation contractuelle s’ensuit.
      </p>

      <h2>Espace client Support</h2>
      <p>
        Les comptes de l’espace client sont créés uniquement sur invitation de notre équipe. Nous
        traitons le nom, l’adresse e-mail et l’entreprise de chaque utilisateur, ainsi que les
        tickets, messages et fichiers déposés. Ces données servent à fournir le support prévu par
        notre relation contractuelle et sont conservées pendant la durée de celle-ci. Les mots de
        passe ne sont jamais stockés en clair et les fichiers ne sont accessibles qu’à l’entreprise
        concernée et à notre équipe.
      </p>

      <h2>Données techniques et sécurité</h2>
      <p>
        Pour protéger le site contre les abus, l’adresse IP est utilisée sous une forme chiffrée
        (empreinte) pour limiter le nombre d’envois ; ces compteurs expirent au bout de quinze
        minutes et sont ensuite supprimés automatiquement. Le serveur tient également des journaux techniques à des fins de
        sécurité. Les échanges avec le site sont chiffrés (HTTPS).
      </p>

      <h2>Cookies</h2>
      <p>
        Ce site n’utilise ni cookie publicitaire ni outil de mesure d’audience. Seul un cookie
        technique de session est déposé lorsque vous vous connectez à l’espace client ; il expire
        au bout d’une heure. La page Contact affiche une carte Google Maps : lors de son
        affichage, Google peut recevoir votre adresse IP et déposer ses propres cookies, selon sa{" "}
        <a href="https://policies.google.com/privacy?hl=fr" target="_blank" rel="noopener noreferrer">
          politique de confidentialité
        </a>.
      </p>

      <h2>Destinataires et hébergement</h2>
      <p>
        Vos données sont destinées à la seule équipe de {LEGAL.name} ; elles ne sont ni vendues ni
        cédées. Le site est hébergé sur un serveur loué auprès de {LEGAL.host.name}, prestataire
        établi en Allemagne, qui n’a pas vocation à consulter ces données.
      </p>

      <h2>Vos droits</h2>
      <p>
        Vous disposez d’un droit d’accès, de rectification, d’opposition et de suppression de vos
        données. Pour l’exercer, écrivez-nous à {mail} en précisant votre demande. Vous pouvez
        également adresser une réclamation à la Commission de protection des données personnelles
        du Sénégal (
        <a href="https://www.cdp.sn" target="_blank" rel="noopener noreferrer">cdp.sn</a>).
      </p>

      <p>
        Voir aussi les <Link href="/mentions-legales">mentions légales</Link>.
      </p>
    </main>
  );
}
