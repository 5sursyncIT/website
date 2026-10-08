"use client";
import { useFormFields } from "@payloadcms/ui";
// Reply shortcuts for a contact request; the request itself stays read-only.
export function ContactActions() {
  const name = useFormFields(([f]) => f.name?.value as string | undefined);
  const email = useFormFields(([f]) => f.email?.value as string | undefined);
  const phone = useFormFields(([f]) => f.phone?.value as string | undefined);
  const topic = useFormFields(([f]) => f.topicLabel?.value as string | undefined);
  if (!email && !phone) return null;
  const subject = `5/Sync IT — votre demande${topic ? ` (${topic})` : ""}`;
  const body = `Bonjour${name ? ` ${name}` : ""},\n\n`;
  const tel = phone?.replace(/[^\d+]/g, "");
  return (
    <div className="sync-contact-actions">
      <p className="sync-contact-actions__title">Répondre</p>
      {email && (
        <a
          className="btn btn--style-primary btn--size-medium sync-contact-actions__btn"
          href={`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
        >
          Écrire à {email}
        </a>
      )}
      {tel && (
        <a
          className="btn btn--style-secondary btn--size-medium sync-contact-actions__btn"
          href={`tel:${tel}`}
        >
          Appeler le {phone}
        </a>
      )}
    </div>
  );
}
