"use client";
import { useState, useRef } from "react";
import { topics } from "@/lib/contact-topics";
const copy = {
  fr: {
    failed: "La demande n’a pas pu être enregistrée. Réessayez plus tard.",
    notice: "Votre demande sera enregistrée pour être traitée par notre équipe.",
    name: "Nom *", company: "Entreprise", email: "E-mail *", phone: "Téléphone",
    topic: "Votre besoin *", choose: "Choisir un sujet", message: "Message *", website: "Site web",
    help: "* Champs obligatoires. Évitez les mots de passe et les données sensibles. Vos données servent uniquement à répondre à votre demande (",
    privacy: "politique de confidentialité", privacyHref: "/politique-de-confidentialite",
    busy: "Enregistrement…", submit: "Envoyer la demande",
    topics: Object.fromEntries(topics) as Record<string, string>,
  },
  en: {
    failed: "Your request could not be recorded. Please try again later.",
    notice: "Your request will be recorded and handled by our team.",
    name: "Name *", company: "Company", email: "Email *", phone: "Phone",
    topic: "Your need *", choose: "Choose a topic", message: "Message *", website: "Website",
    help: "* Required fields. Please do not include passwords or sensitive data. Your details are used only to answer your request (",
    privacy: "privacy policy", privacyHref: "/en/privacy-policy",
    busy: "Recording…", submit: "Send request",
    topics: {
      "reseaux-cloud": "Networks and cloud",
      "solutions-metier": "Business solutions",
      "developpement-api": "Development and APIs",
      "maintenance-support": "Maintenance and support",
      autre: "Other need",
    } as Record<string, string>,
  },
};
// The API answers in French; English visitors get the equivalent message for its status.
const englishStatus = (status: number) =>
  status < 300 ? "Your request has been recorded."
  : status === 400 ? "Please check the form fields."
  : status === 429 ? "Too many requests. Please try again later."
  : copy.en.failed;
export function ContactForm({ locale = "fr" }: { locale?: "fr" | "en" }) {
  const l = copy[locale];
  const submission = useRef<{key:string;body:string}|null>(null);
  const submitting = useRef(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if(submitting.current)return;
        submitting.current=true;
        setBusy(true);
        setStatus("");
        const form = e.currentTarget;
        const data = Object.fromEntries(new FormData(form));
        const body=JSON.stringify(data);
        if(!submission.current || submission.current.body!==body) submission.current={key:crypto.randomUUID(),body};
        try {
          const response = await fetch("/api/contact", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Idempotency-Key": submission.current.key },
            body,
          });
          const result = await response.json();
          setStatus(locale === "en" ? englishStatus(response.status) : result.message || result.error);
          if (response.ok) {form.reset();submission.current=null;}
        } catch {
          setStatus(l.failed);
        } finally {
          submitting.current=false;
          setBusy(false);
        }
      }}
    >
      <p className="demo-notice">
        {l.notice}
      </p>
      <div className="form-grid">
        <label>
          {l.name}
          <input
            name="name"
            autoComplete="name"
            required
            minLength={2}
            maxLength={100}
          />
        </label>
        <label>
          {l.company}
          <input name="company" autoComplete="organization" maxLength={150} />
        </label>
        <label>
          {l.email}
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={150}
          />
        </label>
        <label>
          {l.phone}
          <input name="phone" type="tel" autoComplete="tel" maxLength={40} />
        </label>
        <label className="full">
          {l.topic}
          <select name="topic" required>
            <option value="">{l.choose}</option>
            {topics.map(([value]) => (
              <option value={value} key={value}>
                {l.topics[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="full">
          {l.message}
          <textarea
            name="message"
            rows={6}
            required
            minLength={10}
            maxLength={3000}
          />
        </label>
      </div>
      <label className="honeypot" aria-hidden="true">
        {l.website}
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <p className="form-help">
        {l.help}
        <a href={l.privacyHref}>{l.privacy}</a>).
      </p>
      <button className="button aqua submit" disabled={busy} type="submit">
        {busy ? l.busy : l.submit} ↗
      </button>
      <p role="status" className="form-status" hidden={!status}>
        {status}
      </p>
    </form>
  );
}
