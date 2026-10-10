export function statusLabel(status: string) {
  return (
    (
      {
        open: "Ouvert",
        "in-progress": "En cours",
        "waiting-client": "En attente de votre réponse",
        resolved: "Résolu",
        closed: "Fermé",
      } as Record<string, string>
    )[status] || status
  );
}
// Internal triage priority, set by the team (clients never choose it, so nothing
// pushes everything to "urgent"). Order is what the CRM home page sorts on.
export const ticketPriorities = [
  ["urgent", "Urgente"],
  ["high", "Haute"],
  ["normal", "Normale"],
  ["low", "Basse"],
] as const;
export type TicketPriority = (typeof ticketPriorities)[number][0];
export const priorityLabel = (value: unknown) =>
  ticketPriorities.find(([v]) => v === value)?.[1] ?? "Normale";
// Lower rank = handled first.
export const priorityRank = (value: unknown) => {
  const i = ticketPriorities.findIndex(([v]) => v === value);
  return i < 0 ? ticketPriorities.findIndex(([v]) => v === "normal") : i;
};
export type ReplyAuthor = { relationTo?: string } | string | number | null | undefined;
export type TicketReply = { ticket?: unknown; author?: ReplyAuthor; createdAt?: string | null };
// Who owes an answer, read from the replies themselves — never from updatedAt, which an
// internal note or a status change also bumps. A ticket with no team reply at all has been
// waiting since it was opened; otherwise it waits from the client's last message on.
export function waitingState(
  ticket: { id: number | string; createdAt?: string | null },
  replies: TicketReply[],
) {
  const mine = replies.filter((r) => String(relationOf(r.ticket)) === String(ticket.id));
  const last = (from: "admins" | "client-accounts") =>
    mine
      .filter((r) => (typeof r.author === "object" && r.author ? r.author.relationTo : null) === from)
      .map((r) => r.createdAt || "")
      .sort()
      .at(-1) || null;
  const team = last("admins");
  const client = last("client-accounts");
  // Awaiting the team when the client spoke last, or when nobody from the team ever did.
  const awaiting = !team || (client ? client > team : false);
  return { team, client, awaiting, since: awaiting ? client || ticket.createdAt || null : team };
}
const relationOf = (value: unknown) =>
  value && typeof value === "object" && "value" in (value as object)
    ? (value as { value: unknown }).value
    : value && typeof value === "object" && "id" in (value as object)
      ? (value as { id: unknown }).id
      : value;
