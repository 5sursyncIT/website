"use client";
import { useState, useRef } from "react";
import { topics } from "@/lib/contact-topics";
export function ContactForm() {
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
          setStatus(result.message || result.error);
          if (response.ok) {form.reset();submission.current=null;}
        } catch {
          setStatus(
            "La demande n’a pas pu être enregistrée. Réessayez plus tard.",
          );
        } finally {
          submitting.current=false;
          setBusy(false);
        }
      }}
    >
      <p className="demo-notice">
        Votre demande sera enregistrée pour être traitée par notre équipe.
      </p>
      <div className="form-grid">
        <label>
          Nom *
          <input
            name="name"
            autoComplete="name"
            required
            minLength={2}
            maxLength={100}
          />
        </label>
        <label>
          Entreprise
          <input name="company" autoComplete="organization" maxLength={150} />
        </label>
        <label>
          E-mail *
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={150}
          />
        </label>
        <label>
          Téléphone
          <input name="phone" type="tel" autoComplete="tel" maxLength={40} />
        </label>
        <label className="full">
          Votre besoin *
          <select name="topic" required>
            <option value="">Choisir un sujet</option>
            {topics.map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="full">
          Message *
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
        Site web
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <p className="form-help">
        * Champs obligatoires. Évitez les mots de passe et les données
        sensibles.{" "}
        Vos données servent uniquement à répondre à votre demande (
        <a href="/politique-de-confidentialite">politique de confidentialité</a>).
      </p>
      <button className="button aqua submit" disabled={busy} type="submit">
        {busy ? "Enregistrement…" : "Envoyer la demande"} ↗
      </button>
      <p role="status" className="form-status" hidden={!status}>
        {status}
      </p>
    </form>
  );
}
