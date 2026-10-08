"use client";
import { useCallback, useEffect, useState } from "react";
import { useConfig, useDocumentInfo } from "@payloadcms/ui";
// Conversation of a ticket inside its edit view. Reads and writes go through the
// CMS REST API, so the existing collection access rules apply unchanged.
type Author = { relationTo: string; value: { name?: string; email?: string } | number };
type Entry = {
  id: number;
  kind: "reply" | "note";
  text: string;
  createdAt: string;
  author?: Author;
};
const when = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Dakar",
});
function authorName(author?: Author) {
  if (!author || typeof author.value !== "object") return "";
  const who = author.value.name || author.value.email || "";
  return author.relationTo === "admins" ? `${who} (5/Sync IT)` : who;
}
export function TicketThread() {
  const { id } = useDocumentInfo();
  const { config } = useConfig();
  const api = config.serverURL + config.routes.api;
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"reply" | "note">("reply");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const query = `where[ticket][equals]=${encodeURIComponent(String(id))}&sort=createdAt&limit=200&depth=1`;
    try {
      const [replies, notes] = await Promise.all(
        ["ticket-replies", "ticket-notes"].map((slug) =>
          fetch(`${api}/${slug}?${query}`, { credentials: "include" }).then((r) => {
            if (!r.ok) throw new Error(String(r.status));
            return r.json();
          }),
        ),
      );
      const all: Entry[] = [
        ...replies.docs.map((d: any) => ({ id: d.id, kind: "reply", text: d.message, createdAt: d.createdAt, author: d.author })),
        ...notes.docs.map((d: any) => ({ id: d.id, kind: "note", text: d.note, createdAt: d.createdAt })),
      ];
      all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      setEntries(all);
      setError("");
    } catch {
      setError("Impossible de charger les échanges. Rechargez la page.");
    }
  }, [api, id]);
  useEffect(() => {
    load();
  }, [load]);

  if (!id) return null;
  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    const res = await fetch(`${api}/${kind === "reply" ? "ticket-replies" : "ticket-notes"}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(kind === "reply" ? { ticket: id, message: body } : { ticket: id, note: body }),
    }).catch(() => null);
    setSending(false);
    if (!res?.ok) {
      setError("Envoi refusé ou impossible. Le texte est conservé, réessayez.");
      return;
    }
    setText("");
    load();
  }

  return (
    <section className="sync-thread">
      <h3>Échanges</h3>
      {entries === null && !error && <p className="sync-thread__empty">Chargement…</p>}
      {entries?.length === 0 && <p className="sync-thread__empty">Aucun échange pour l’instant.</p>}
      {entries?.map((e) => (
        <article key={`${e.kind}-${e.id}`} className={`sync-thread__item sync-thread__item--${e.kind}`}>
          <header>
            <strong>{e.kind === "note" ? "Note interne (invisible pour le client)" : authorName(e.author)}</strong>
            <small>{when.format(new Date(e.createdAt))}</small>
          </header>
          <p>{e.text}</p>
        </article>
      ))}
      <div className="sync-thread__compose">
        <div className="sync-thread__tabs" role="radiogroup" aria-label="Type de message">
          <label>
            <input type="radio" checked={kind === "reply"} onChange={() => setKind("reply")} /> Réponse au client
          </label>
          <label>
            <input type="radio" checked={kind === "note"} onChange={() => setKind("note")} /> Note interne
          </label>
        </div>
        <textarea
          rows={5}
          maxLength={10000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={kind === "reply" ? "Votre réponse, visible par le client dans l’espace Support" : "Note réservée à l’équipe"}
        />
        {error && <p className="sync-thread__error" role="alert">{error}</p>}
        <p className="sync-thread__hint">
          Aucun email n’est envoyé : le client voit la réponse en se connectant à l’espace Support.
        </p>
        <button
          type="button"
          className="btn btn--style-primary btn--size-medium"
          disabled={!text.trim() || sending}
          onClick={send}
        >
          {sending ? "Envoi…" : kind === "reply" ? "Publier la réponse" : "Ajouter la note"}
        </button>
      </div>
    </section>
  );
}
