"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function ActionForm({
  endpoint,
  children,
  label,
  redirect,
}: {
  endpoint: string;
  children: React.ReactNode;
  label: string;
  redirect?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const router = useRouter();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        setBusy(true);
        setStatus("");
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.fromEntries(new FormData(form))),
          });
          const data = await response.json();
          if (!response.ok) {
            setStatus(data.error || "Demande refusée.");
            return;
          }
          if (redirect) {
            router.push(
              redirect === "ticket" ? `/support/tickets/${data.id}` : redirect,
            );
          } else {
            setStatus("Enregistré.");
            form.reset();
            router.refresh();
          }
        } catch {
          setStatus("Le service est temporairement indisponible.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      <button className="button aqua" type="submit" disabled={busy}>
        {busy ? "Traitement…" : label}
      </button>
      <p role="status" className="form-status" hidden={!status}>
        {status}
      </p>
    </form>
  );
}
export function UploadForm({ ticket }: { ticket: string }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const router = useRouter();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        const file = data.get("file");
        if (!(file instanceof File) || file.size > 5 * 1024 * 1024) {
          setStatus("5 Mo maximum.");
          return;
        }
        setBusy(true);
        try {
          const response = await fetch(`/api/support/tickets/${ticket}/files`, {
            method: "POST",
            body: data,
          });
          const result = await response.json();
          setStatus(response.ok ? "Fichier enregistré." : result.error);
          if (response.ok) {
            form.reset();
            router.refresh();
          }
        } catch {
          setStatus("Le fichier n’a pas pu être enregistré.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Pièce jointe (PDF, PNG ou JPEG, 5 Mo maximum)
        <input
          type="file"
          name="file"
          accept="application/pdf,image/png,image/jpeg"
          required
        />
      </label>
      <button className="button navy" disabled={busy}>
        Ajouter le fichier
      </button>
      <p role="status">{status}</p>
    </form>
  );
}
export function Logout() {
  const router = useRouter();
  return (
    <button
      className="button navy"
      onClick={async () => {
        const response = await fetch("/api/support/logout", { method: "POST" });
        if (response.ok) {
          router.push("/support/connexion");
          router.refresh();
        }
      }}
    >
      Se déconnecter
    </button>
  );
}
