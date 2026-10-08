"use client";
import { useState } from "react";
export function TeamInviteForm({
  clients,
}: {
  clients: { id: number; name: string }[];
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    error?: string;
    invitationURL?: string;
    message?: string;
  }>({});
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const data = Object.fromEntries(new FormData(e.currentTarget));
        try {
          const response = await fetch("/api/team/invitations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...data, client: Number(data.client) }),
          });
          setResult(await response.json());
        } catch {
          setResult({ error: "Service indisponible." });
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Organisation cliente
        <select name="client" required>
          <option value="">Choisir une organisation</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Nom
        <input name="name" required maxLength={100} />
      </label>
      <label>
        E-mail
        <input name="email" type="email" required maxLength={150} />
      </label>
      <button className="button aqua" disabled={busy}>
        Créer une invitation
      </button>
      <p role="status">{result.error || result.message}</p>
      {result.invitationURL && (
        <label>
          Lien confidentiel valable 24 heures : copiez-le dans un canal privé
          vérifié.
          <textarea readOnly value={result.invitationURL} rows={4} />
        </label>
      )}
    </form>
  );
}
