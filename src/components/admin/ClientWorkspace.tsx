"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConfig, useDocumentInfo } from "@payloadcms/ui";
// Client company page: its users, invitations and tickets. Data goes through the
// CMS REST API and the existing /api/team/invitations route (admin-only, no email).
type Account = {
  id: number;
  name: string;
  email: string;
  enabled?: boolean | null;
  invitedAt?: string | null;
  invitationExpiresAt?: string | null;
};
type Ticket = { id: number; subject: string; status: string; updatedAt: string };
const statusLabels: Record<string, string> = {
  open: "Ouvert",
  "in-progress": "En cours",
  "waiting-client": "En attente client",
  resolved: "Résolu",
  closed: "Fermé",
};
const date = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Dakar",
});
function accountState(a: Account) {
  if (a.enabled) return { label: "Accès actif", tone: "ok" };
  if (a.invitationExpiresAt && new Date(a.invitationExpiresAt) > new Date())
    return { label: `Invitation en attente (jusqu’au ${date.format(new Date(a.invitationExpiresAt))})`, tone: "wait" };
  if (a.invitedAt) return { label: "Invitation expirée", tone: "off" };
  return { label: "Désactivé", tone: "off" };
}
export function ClientWorkspace() {
  const { id } = useDocumentInfo();
  const { config } = useConfig();
  const admin = config.routes.admin;
  const api = config.serverURL + config.routes.api;
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<{ error?: string; url?: string; message?: string; who?: string }>({});
  const [copied, setCopied] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const where = `where[client][equals]=${encodeURIComponent(String(id))}&depth=0&limit=200`;
    try {
      const get = (path: string) =>
        fetch(`${api}/${path}`, { credentials: "include" }).then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json();
        });
      const [a, t] = await Promise.all([
        get(`client-accounts?${where}&sort=name`),
        get(`tickets?${where}&sort=-updatedAt`),
      ]);
      setAccounts(a.docs);
      setTickets(t.docs);
      setLoadError("");
    } catch {
      setLoadError("Impossible de charger les utilisateurs et tickets. Rechargez la page.");
    }
  }, [api, id]);
  useEffect(() => {
    load();
  }, [load]);

  async function sendInvite(name: string, email: string) {
    setBusy(true);
    setCopied(false);
    setInvite({});
    try {
      const res = await fetch("/api/team/invitations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, client: Number(id) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setInvite({ error: body.error || body.message || "Invitation refusée." });
      else setInvite({ url: body.invitationURL, message: body.message, who: email });
      load();
    } catch {
      setInvite({ error: "Service indisponible, réessayez." });
    } finally {
      setBusy(false);
    }
  }

  function submitInvite() {
    const name = nameRef.current, email = emailRef.current;
    if (!name || !email || busy) return;
    if (!name.reportValidity() || !email.reportValidity()) return;
    sendInvite(name.value.trim(), email.value.trim());
    name.value = "";
    email.value = "";
  }

  if (!id) return null;
  const active = tickets?.filter((t) => !["resolved", "closed"].includes(t.status)).length ?? 0;
  return (
    <div className="sync-client">
      {loadError && <p className="sync-thread__error" role="alert">{loadError}</p>}

      <section className="sync-panel">
        <div className="sync-client__head">
          <h3>Utilisateurs de l’espace Support</h3>
          <span>{accounts?.length ?? "…"}</span>
        </div>
        {accounts?.length === 0 && <p className="sync-panel__empty">Aucun utilisateur. Invitez le premier ci-dessous.</p>}
        {!!accounts?.length && (
          <ul>
            {accounts.map((a) => {
              const state = accountState(a);
              return (
                <li key={a.id} className="sync-client__row">
                  <a href={`${admin}/collections/client-accounts/${a.id}`}>
                    <strong>{a.name}</strong>
                    <small>{a.email}</small>
                  </a>
                  <span className={`sync-badge sync-badge--${state.tone}`}>{state.label}</span>
                  {!a.enabled && (
                    <button
                      type="button"
                      className="btn btn--style-secondary btn--size-small"
                      disabled={busy}
                      onClick={() => sendInvite(a.name, a.email)}
                    >
                      Nouveau lien
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Not a <form>: this sits inside Payload's document form. */}
        <div className="sync-client__invite">
          <h4>Inviter un utilisateur</h4>
          <div className="sync-client__fields" onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitInvite();
            }
          }}>
            <input ref={nameRef} name="name" required maxLength={100} placeholder="Nom et prénom" aria-label="Nom et prénom" />
            <input ref={emailRef} name="email" type="email" required maxLength={150} placeholder="email@entreprise.com" aria-label="Email" />
            <button type="button" onClick={submitInvite} className="btn btn--style-primary btn--size-medium" disabled={busy}>
              {busy ? "Création…" : "Créer l’invitation"}
            </button>
          </div>
          <p className="sync-thread__hint">
            Aucun email n’est envoyé : copiez le lien et transmettez-le vous-même par un canal privé vérifié.
            Le compte reste désactivé jusqu’à ce que l’utilisateur choisisse son mot de passe.
          </p>
          {invite.error && <p className="sync-thread__error" role="alert">{invite.error}</p>}
          {invite.url && (
            <div className="sync-client__link" role="status">
              <p>
                Lien d’activation pour <strong>{invite.who}</strong>, valable 24 heures et utilisable une seule fois :
              </p>
              <textarea readOnly rows={3} value={invite.url} onFocus={(e) => e.currentTarget.select()} />
              <button
                type="button"
                className="btn btn--style-secondary btn--size-small"
                onClick={() => navigator.clipboard?.writeText(invite.url!).then(() => setCopied(true))}
              >
                {copied ? "Copié ✓" : "Copier le lien"}
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="sync-panel">
        <div className="sync-client__head">
          <h3>Tickets</h3>
          <span>{tickets ? `${active} à traiter · ${tickets.length} au total` : "…"}</span>
        </div>
        {tickets?.length === 0 && <p className="sync-panel__empty">Aucun ticket pour ce client.</p>}
        {!!tickets?.length && (
          <ul>
            {tickets.slice(0, 10).map((t) => (
              <li key={t.id} className="sync-client__row">
                <a href={`${admin}/collections/tickets/${t.id}`}>
                  <strong>{t.subject}</strong>
                  <small>Mis à jour le {date.format(new Date(t.updatedAt))}</small>
                </a>
                <span className={`sync-badge sync-badge--${["resolved", "closed"].includes(t.status) ? "off" : "wait"}`}>
                  {statusLabels[t.status] ?? t.status}
                </span>
              </li>
            ))}
          </ul>
        )}
        {(tickets?.length ?? 0) > 10 && (
          <a className="sync-overview__site" href={`${admin}/collections/tickets?where[client][equals]=${id}`}>
            Voir les {tickets!.length} tickets →
          </a>
        )}
      </section>
    </div>
  );
}
