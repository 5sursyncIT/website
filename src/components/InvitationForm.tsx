"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
export function InvitationForm() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  useEffect(() => {
    setToken(window.location.hash.slice(1));
    window.history.replaceState(null, "", "/support/activation");
  }, []);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        if (form.get("password") !== form.get("confirm")) {
          setStatus("Les mots de passe sont différents.");
          return;
        }
        setBusy(true);
        try {
          const response = await fetch("/api/support/activate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, password: form.get("password") }),
          });
          const result = await response.json();
          if (response.ok) router.push("/support/connexion");
          else setStatus(result.error);
        } catch {
          setStatus("Le service est temporairement indisponible.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Choisissez un mot de passe (14 caractères minimum)
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={14}
          maxLength={200}
          required
        />
      </label>
      <label>
        Confirmez le mot de passe
        <input
          type="password"
          name="confirm"
          autoComplete="new-password"
          minLength={14}
          maxLength={200}
          required
        />
      </label>
      <button className="button aqua" disabled={busy || !token}>
        Activer mon accès
      </button>
      <p role="status">
        {status ||
          (!token ? "Ouvrez le lien complet reçu de notre équipe." : "")}
      </p>
    </form>
  );
}
