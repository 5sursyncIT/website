import { notFound } from "next/navigation";
import { supportPageUser } from "@/lib/backend";
import { ActionForm, UploadForm } from "@/components/SupportForms";
import { statusLabel } from "@/lib/support";
export const dynamic = "force-dynamic";
export const metadata = { title: "Suivi du ticket" };
export default async function Ticket({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { payload, user } = await supportPageUser();
  const { id } = await params;
  let ticket;
  try {
    ticket = await payload.findByID({
      collection: "tickets",
      id,
      user,
      overrideAccess: false,
      depth: 0,
    });
  } catch {
    notFound();
  }
  const [replies, files] = await Promise.all([
    payload.find({
      collection: "ticket-replies",
      user,
      overrideAccess: false,
      where: { ticket: { equals: id } },
      depth: 0,
      sort: "createdAt",
      limit: 100,
    }),
    payload.find({
      collection: "ticket-files",
      user,
      overrideAccess: false,
      where: { ticket: { equals: id } },
      depth: 0,
      limit: 100,
    }),
  ]);
  return (
    <main id="contenu" className="container support-shell">
      <a href="/support">← Mes tickets</a>
      <h1>{ticket.subject}</h1>
      <p>{statusLabel(ticket.status)}</p>
      <div className="support-message">{ticket.description}</div>
      <h2>Échanges</h2>
      {replies.docs.length ? (
        replies.docs.map((reply) => (
          <article className="support-message" key={reply.id}>
            <small>
              {reply.author?.relationTo === "admins"
                ? "Équipe 5/Sync IT"
                : "Client"}{" "}
              · {new Date(reply.createdAt).toLocaleString("fr-FR")}
            </small>
            <p>{reply.message}</p>
          </article>
        ))
      ) : (
        <p>Aucune réponse pour le moment.</p>
      )}
      {ticket.status !== "closed" && (
        <ActionForm
          endpoint={`/api/support/tickets/${id}/replies`}
          label="Ajouter une réponse"
        >
          <label>
            Votre réponse
            <textarea name="message" required rows={5} maxLength={10000} />
          </label>
        </ActionForm>
      )}
      <h2>Pièces jointes</h2>
      <ul>
        {files.docs.map((file) => (
          <li key={file.id}>
            <a className="text-link" href={`/api/support/files/${file.id}`}>
              {file.name} · {Math.ceil(file.bytes / 1024)} Ko ↓
            </a>
          </li>
        ))}
      </ul>
      {ticket.status !== "closed" && <UploadForm ticket={id} />}
    </main>
  );
}
