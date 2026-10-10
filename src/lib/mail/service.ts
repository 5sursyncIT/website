import { readFileSync } from "node:fs";
import path from "node:path";
import type { Pool } from "pg";
import { canMail, type MailLevel } from "./access";
import { mailStatus } from "./config";
import { Graph, GraphError, GraphUncertain } from "./graph";
import { MailStore, type DraftRow, type GraphMessage, type MessageRow } from "./store";
import { MailRefused } from "./errors";
import { ImapMailbox } from "./imap";
import {
  discardImapDraft, imapAttachment, prepareImapDraft, prepareImapReply, readImapDraft, readImapMessage, retryImapSentCopy, sendImapDraft,
  updateImapDraft, verifyImapDraft, type ImapDeps,
} from "./imap-service";
import type { OutgoingAttachment } from "./mime";
import { LOGO_CID, composeBody, composeFromText, normalizeAddress, parseRecipients, quoteHtml, sendRefusal, senderRefusal, stripActiveHtml } from "./rules";
// Internal functions of the CRM ↔ mailbox link. The /crm pages use them, and they are the
// documented entry points for a future, separately verified connection of Charlie
// (documentation/microsoft365.md, section 11). No public route exposes them.
// Every function checks the actor's right first: read < draft < send.
// Two providers, one active at a time (config.ts): Microsoft Graph (contact@5sursync.com,
// code below) or SMTP/IMAP at Simafri (contact@crm.5sursync.com, imap-service.ts). A draft
// is handled only by the provider that created it: no message can leave through both.

export type MailActor = { id: number; level: MailLevel; channel: "crm" | "charlie" };
export type GraphDeps = { kind?: "graph"; graph: Graph; store: MailStore };
export type MailDeps = GraphDeps | ImapDeps;
export type { ImapDeps };
export { MailRefused };
export const isImap = (deps: Pick<MailDeps, "store"> & { kind?: string }): deps is ImapDeps => deps.kind === "imap";
export const providerOf = (deps: Pick<MailDeps, "store"> & { kind?: string }) => (isImap(deps) ? "imap" : "graph");
export const mailboxAddress = (deps: MailDeps) => (isImap(deps) ? deps.imap.config.mailboxAddress : deps.graph.config.mailboxAddress);

export function mailDeps(pool: Pool): MailDeps | null {
  const status = mailStatus();
  if (!status.enabled) return null;
  if (status.provider === "imap")
    return { kind: "imap", imap: new ImapMailbox(status.config), store: new MailStore(pool, status.config.mailboxAddress), logo: logoBuffer };
  return { kind: "graph", graph: new Graph(status.config), store: new MailStore(pool, status.config.mailboxAddress) };
}
// A draft written by the other provider is never touched (read only, for history).
function sameProvider(deps: MailDeps, row: { provider?: string | null }) {
  if ((row.provider ?? "graph") !== providerOf(deps))
    throw new MailRefused(row.provider === "imap"
      ? "Brouillon créé avec la messagerie Simafri : il ne peut pas partir par Microsoft."
      : "Brouillon créé avec l’ancienne messagerie Microsoft 365 : il ne peut pas partir par Simafri. Recréez-le.");
}
const noAttachments = (files?: OutgoingAttachment[]) => {
  if (files?.length) throw new MailRefused("Pièces jointes disponibles seulement avec la messagerie Simafri.");
};
function need(actor: MailActor, level: "read" | "draft" | "send") {
  if (!canMail({ mailAccess: actor.level }, level))
    throw new MailRefused(level === "send" ? "Envoi réservé aux administrateurs autorisés." : level === "draft" ? "Rédaction non autorisée pour ce compte." : "Messagerie non autorisée pour ce compte.");
}
const recipients = (list: string[]) => list.map((address) => ({ emailAddress: { address } }));
// Every draft written by the CRM carries contact@ as from and sender (Graph message fields),
// so that the mailbox, not the person opening it in Outlook, is the sender.
const asMailbox = (deps: GraphDeps) => {
  const me = { emailAddress: { address: deps.graph.config.mailboxAddress } };
  return { from: me, sender: me };
};
const fromRecipients = (list?: { emailAddress?: { address?: string } }[]) => (list ?? []).map((r) => normalizeAddress(r.emailAddress?.address)).filter(Boolean);
const messagePath = (deps: GraphDeps, graphId: string) => `${deps.graph.mailbox}/messages/${encodeURIComponent(graphId)}`;
let logo: Buffer | undefined;
const logoBuffer = () => (logo ??= readFileSync(path.join(process.cwd(), "public/assets/logo-horizontal.jpeg")));
const logoBase64 = () => logoBuffer().toString("base64");

// ---------- Read ----------
export async function searchContacts(deps: Pick<MailDeps, "store">, actor: MailActor, query: string) {
  need(actor, "read");
  const q = `%${query.trim().toLowerCase().slice(0, 80)}%`;
  const { rows } = await deps.store.pool.query(
    `SELECT k.id, k.name, k.email, k.client_id, c.name AS client FROM crm_contacts k JOIN clients c ON c.id=k.client_id
     WHERE k.search_text LIKE $1 OR lower(k.email) LIKE $1 ORDER BY k.name LIMIT 20`, [q]);
  return rows as { id: number; name: string; email: string | null; client_id: number; client: string }[];
}
export async function history(deps: Pick<MailDeps, "store">, actor: MailActor, where: { clientId?: number; contactId?: number }) {
  need(actor, "read");
  const [messages, drafts] = await Promise.all([deps.store.messagesFor(where), deps.store.draftsFor(where)]);
  return { messages, drafts };
}
// Body and attachment list read from Microsoft on demand, never stored.
export async function readMessage(deps: MailDeps, actor: MailActor, id: number, format: "text" | "html" = "text") {
  need(actor, "read");
  const row = await deps.store.message(id);
  if (!row) return null;
  if (isImap(deps)) {
    if (row.provider !== "imap") return null;
    const r = await readImapMessage(deps, row, format);
    return r ? { row, ...r } : null;
  }
  if (row.provider === "imap") return null;
  const res = await deps.graph.call("read", `${messagePath(deps, row.graph_id)}?$select=body,webLink`, {
    headers: { Prefer: `IdType="ImmutableId", outlook.body-content-type="${format}"` },
  });
  const body = String((res.json?.body as { content?: string } | undefined)?.content ?? "");
  let attachments: { id: string; name: string; contentType: string; size: number; isInline: boolean }[] = [];
  if (row.has_attachments) {
    const a = await deps.graph.call("read", `${messagePath(deps, row.graph_id)}/attachments?$select=id,name,contentType,size,isInline`);
    attachments = ((a.json?.value as typeof attachments) ?? []).filter((x) => !x.isInline);
  }
  return { row, body: format === "html" ? stripActiveHtml(body) : body, attachments };
}
export async function attachment(deps: MailDeps, actor: MailActor, id: number, attachmentId: string) {
  need(actor, "read");
  const row = await deps.store.message(id);
  if (!row || (row.provider ?? "graph") !== providerOf(deps)) return null;
  if (isImap(deps)) return imapAttachment(deps, row, attachmentId);
  const base = `${messagePath(deps, row.graph_id)}/attachments/${encodeURIComponent(attachmentId)}`;
  const meta = await deps.graph.call("read", `${base}?$select=name,contentType,size`);
  const size = Number(meta.json?.size ?? 0);
  if (size > 25 * 1024 * 1024) throw new MailRefused("Pièce jointe trop volumineuse (25 Mo au plus) : ouvrez-la dans Outlook.");
  const raw = await deps.graph.call("read", `${base}/$value`, { raw: true });
  return { name: String(meta.json?.name ?? "piece-jointe"), bytes: raw.bytes! };
}
export async function readDraft(deps: MailDeps, actor: MailActor, id: number) {
  need(actor, "read");
  const row = await deps.store.draft(id);
  if (!row) return null;
  if ((row.provider ?? "graph") !== providerOf(deps)) return { row, text: null, outlookEdited: false, missing: row.state === "draft" };
  if (isImap(deps)) return { row, ...(await readImapDraft(deps, row)) };
  if (row.state !== "draft") {
    // Sent or abandoned: the text as it is now in the mailbox (immutable id), if still there.
    const text = await deps.graph
      .call("read", `${messagePath(deps, row.graph_id)}?$select=body`, { headers: { Prefer: 'IdType="ImmutableId", outlook.body-content-type="text"' } })
      .then((r) => composeFromText(String((r.json?.body as { content?: string } | undefined)?.content ?? "")))
      .catch(() => null);
    return { row, text, outlookEdited: false, missing: false };
  }
  try {
    const res = await deps.graph.call("read", `${messagePath(deps, row.graph_id)}?$select=body,changeKey,isDraft`, {
      headers: { Prefer: 'IdType="ImmutableId", outlook.body-content-type="text"' },
    });
    const text = composeFromText(String((res.json?.body as { content?: string } | undefined)?.content ?? ""));
    return { row, text, outlookEdited: res.json?.changeKey !== row.change_key, missing: res.json?.isDraft === false };
  } catch (e) {
    if (e instanceof GraphError && e.status === 404) return { row, text: null, outlookEdited: false, missing: true };
    throw e;
  }
}

// ---------- Draft (never sends) ----------
type DraftInput = { clientId: number | null; contactId: number | null; to: string; cc?: string; subject: string; text: string };
function checkInput(input: { to: string; cc?: string; subject: string; text: string }) {
  const to = parseRecipients(input.to), cc = parseRecipients(input.cc ?? "");
  const invalid = [...to.invalid, ...cc.invalid];
  if (invalid.length) throw new MailRefused(`Adresse invalide : ${invalid.join(", ")}.`);
  if (!to.addresses.length) throw new MailRefused("Indiquez au moins un destinataire.");
  const subject = input.subject.trim();
  if (!subject || subject.length > 300) throw new MailRefused("Objet requis (300 caractères au plus).");
  if (input.text.length > 20000) throw new MailRefused("Texte trop long (20 000 caractères au plus).");
  return { to: to.addresses, cc: cc.addresses, subject };
}
async function addLogo(deps: GraphDeps, graphId: string) {
  await deps.graph.call("read", `${messagePath(deps, graphId)}/attachments`, {
    method: "POST",
    body: { "@odata.type": "#microsoft.graph.fileAttachment", name: "5sync-it.jpg", contentType: "image/jpeg", contentBytes: logoBase64(), isInline: true, contentId: LOGO_CID },
  });
}
async function changeKeyOf(deps: GraphDeps, graphId: string) {
  const r = await deps.graph.call("read", `${messagePath(deps, graphId)}?$select=changeKey,internetMessageId`);
  return { changeKey: (r.json?.changeKey as string) ?? null, internetMessageId: (r.json?.internetMessageId as string) ?? null };
}
export async function prepareDraft(deps: MailDeps, actor: MailActor, input: DraftInput, attachments?: OutgoingAttachment[]) {
  need(actor, "draft");
  const v = checkInput(input);
  if (isImap(deps)) return prepareImapDraft(deps, actor, v, input, attachments ?? []);
  noAttachments(attachments);
  const created = await deps.graph.call("read", `${deps.graph.mailbox}/messages`, {
    method: "POST",
    body: { ...asMailbox(deps), subject: v.subject, body: { contentType: "HTML", content: composeBody(input.text) }, toRecipients: recipients(v.to), ccRecipients: recipients(v.cc) },
  });
  const m = created.json as GraphMessage & { changeKey?: string };
  await addLogo(deps, m.id);
  const after = await changeKeyOf(deps, m.id);
  return deps.store.insertDraft({
    graphId: m.id, internetMessageId: after.internetMessageId ?? m.internetMessageId ?? null, conversationId: m.conversationId ?? null,
    changeKey: after.changeKey, kind: "new", replyTo: null, clientId: input.clientId, contactId: input.contactId,
    to: v.to, cc: v.cc, subject: v.subject, adminId: actor.id, channel: actor.channel,
  });
}
// A reply in the real thread: Exchange's createReply sets the conversation and the
// In-Reply-To / References headers; the CRM then writes the body (text, signature, quote).
async function originalQuote(deps: GraphDeps, original: MessageRow) {
  const r = await deps.graph.call("read", `${messagePath(deps, original.graph_id)}?$select=body`, { headers: { Prefer: 'IdType="ImmutableId", outlook.body-content-type="html"' } });
  return quoteHtml({ fromName: original.from_name, fromAddress: original.from_address, date: original.received_at ?? original.sent_at, html: String((r.json?.body as { content?: string } | undefined)?.content ?? "") });
}
export async function prepareReply(deps: MailDeps, actor: MailActor, messageId: number, text: string, attachments?: OutgoingAttachment[]) {
  need(actor, "draft");
  const original = await deps.store.message(messageId);
  if (!original) throw new MailRefused("Message introuvable.");
  if (text.length > 20000) throw new MailRefused("Texte trop long (20 000 caractères au plus).");
  sameProvider(deps, original);
  if (isImap(deps)) return prepareImapReply(deps, actor, original, text, attachments ?? []);
  noAttachments(attachments);
  const created = await deps.graph.call("read", `${messagePath(deps, original.graph_id)}/createReply`, { method: "POST", body: {} });
  const m = created.json as GraphMessage;
  const to = fromRecipients(m.toRecipients), cc = fromRecipients(m.ccRecipients);
  await deps.graph.call("read", messagePath(deps, m.id), { method: "PATCH", body: { ...asMailbox(deps), body: { contentType: "HTML", content: composeBody(text, await originalQuote(deps, original)) } } });
  await addLogo(deps, m.id);
  const after = await changeKeyOf(deps, m.id);
  return deps.store.insertDraft({
    graphId: m.id, internetMessageId: after.internetMessageId ?? m.internetMessageId ?? null, conversationId: m.conversationId ?? original.conversation_id,
    changeKey: after.changeKey, kind: "reply", replyTo: original.id, clientId: original.client_id, contactId: original.contact_id,
    to, cc, subject: m.subject ?? original.subject, adminId: actor.id, channel: actor.channel,
  });
}
export async function updateDraft(deps: MailDeps, actor: MailActor, id: number, input: { to: string; cc?: string; subject: string; text: string }, attachments?: OutgoingAttachment[], removeAttachments: string[] = []) {
  need(actor, "draft");
  const row = await deps.store.draft(id);
  if (!row || row.state !== "draft") throw new MailRefused("Ce brouillon n’est plus modifiable.");
  const v = checkInput(input);
  sameProvider(deps, row);
  if (isImap(deps)) return updateImapDraft(deps, actor, row, v, input.text, attachments ?? [], removeAttachments);
  noAttachments(attachments);
  const current = await changeKeyOf(deps, row.graph_id);
  if (current.changeKey !== row.change_key)
    throw new MailRefused("Ce brouillon a été modifié dans Outlook : terminez-le dans Outlook pour ne pas écraser ces changements.");
  const quote = row.kind === "reply" && row.reply_to ? await deps.store.message(row.reply_to).then((o) => (o ? originalQuote(deps, o) : "")) : "";
  await deps.graph.call("read", messagePath(deps, row.graph_id), {
    method: "PATCH",
    body: { ...asMailbox(deps), subject: v.subject, toRecipients: recipients(v.to), ccRecipients: recipients(v.cc), body: { contentType: "HTML", content: composeBody(input.text, quote) } },
  });
  const after = await changeKeyOf(deps, row.graph_id);
  await deps.store.updateDraftMeta(id, { ...v, changeKey: after.changeKey, internetMessageId: after.internetMessageId, adminId: actor.id, channel: actor.channel });
}
export async function submitDraft(deps: Pick<MailDeps, "store">, actor: MailActor, id: number) {
  need(actor, "draft");
  if (!(await deps.store.submitDraft(id, actor.id, actor.channel))) throw new MailRefused("Ce brouillon n’est plus modifiable.");
}
export async function discardDraft(deps: MailDeps, actor: MailActor, id: number) {
  need(actor, "draft");
  const row = await deps.store.draft(id);
  if (!row || row.state !== "draft") throw new MailRefused("Seul un brouillon peut être abandonné.");
  sameProvider(deps, row);
  if (isImap(deps)) {
    await discardImapDraft(deps, row);
    await deps.store.setDraftState(id, ["draft"], "discarded", actor.id, actor.channel, "discard");
    return;
  }
  try {
    const r = await deps.graph.call("read", `${messagePath(deps, row.graph_id)}?$select=isDraft`);
    if (r.json?.isDraft === true) await deps.graph.call("read", messagePath(deps, row.graph_id), { method: "DELETE" });
  } catch (e) {
    if (!(e instanceof GraphError && e.status === 404)) throw e;
  }
  await deps.store.setDraftState(id, ["draft"], "discarded", actor.id, actor.channel, "discard");
}

// ---------- Send (explicit action of an authorised person) ----------
export async function sendAuthorizedDraft(deps: MailDeps, actor: MailActor, id: number): Promise<DraftRow["state"]> {
  need(actor, "send");
  const row = await deps.store.draft(id);
  if (!row || row.state !== "draft") throw new MailRefused("Ce brouillon n’est pas prêt à partir (déjà envoyé, abandonné ou en cours).");
  sameProvider(deps, row);
  if (isImap(deps)) return sendImapDraft(deps, actor, row);
  // Recipients, sender and version as they are in the mailbox now. The read goes through
  // /users/{contact@}: a message of any other mailbox is not found (Exchange scope).
  let live;
  try {
    live = await deps.graph.call("read", `${messagePath(deps, row.graph_id)}?$select=isDraft,changeKey,from,sender,toRecipients,ccRecipients,bccRecipients`);
  } catch (e) {
    if (e instanceof GraphError && e.status === 404) throw new MailRefused(`Envoi bloqué : ce brouillon est introuvable dans la boîte ${deps.graph.config.mailboxAddress}.`);
    throw e;
  }
  type Who = { emailAddress?: { address?: string } } | undefined;
  const wrongSender = senderRefusal((live.json?.from as Who)?.emailAddress?.address, (live.json?.sender as Who)?.emailAddress?.address, deps.graph.config.mailboxAddress);
  if (wrongSender) throw new MailRefused(wrongSender);
  if (live.json?.isDraft !== true) throw new MailRefused("Ce message n’est plus un brouillon dans contact@ : vérifiez les Éléments envoyés.");
  if (live.json?.changeKey !== row.change_key) throw new MailRefused("Ce brouillon a été modifié dans Outlook : relisez-le et envoyez-le depuis Outlook, ou réenregistrez-le dans le CRM.");
  const all = [
    ...fromRecipients(live.json?.toRecipients as never), ...fromRecipients(live.json?.ccRecipients as never), ...fromRecipients(live.json?.bccRecipients as never),
  ];
  const refusal = sendRefusal([...new Set(all)], deps.graph.config.sendAllowlist, await deps.store.suppressed(all), deps.graph.config.mailboxAddress);
  if (refusal) throw new MailRefused(refusal);
  const claimed = await deps.store.claimSend(id, actor.id, actor.channel);
  if (!claimed) throw new MailRefused("Envoi déjà demandé pour ce brouillon.");
  let state: "accepted" | "failed" | "uncertain", code: string;
  try {
    const r = await deps.graph.call("send", `${messagePath(deps, row.graph_id)}/send`, { method: "POST", timeoutMs: 30_000 });
    [state, code] = r.status === 202 ? ["accepted", "graph-202"] : ["uncertain", `graph-${r.status}`];
  } catch (e) {
    [state, code] = e instanceof GraphError ? ["failed", `graph-${e.status}-${e.code}`] : ["uncertain", e instanceof GraphUncertain ? "timeout-or-unavailable" : "internal"];
  }
  await deps.store.finishSend(id, claimed.claim!, state, code, actor.id, actor.channel);
  return state;
}
// Read-only check of an uncertain or accepted send. Nothing is ever sent from here.
export async function verifyDraft(deps: MailDeps, actor: MailActor, id: number) {
  need(actor, "read");
  await deps.store.expireSending();
  const row = await deps.store.draft(id);
  if (!row) throw new MailRefused("Brouillon introuvable.");
  if (!["accepted", "uncertain", "failed"].includes(row.state)) return row.state;
  sameProvider(deps, row);
  if (isImap(deps)) return verifyImapDraft(deps, actor, row);
  type Item = { isDraft?: boolean; parentFolderId?: string; internetMessageId?: string };
  let item: Item | null = null;
  try {
    item = (await deps.graph.call("read", `${messagePath(deps, row.graph_id)}?$select=isDraft,parentFolderId,internetMessageId`)).json as Item | null;
  } catch (e) {
    if (!(e instanceof GraphError && e.status === 404)) throw e;
  }
  const sent = (await deps.graph.call("read", `${deps.graph.mailbox}/mailFolders/sentitems?$select=id`)).json?.id;
  if (item && item.isDraft === false && item.parentFolderId === sent) {
    await deps.store.markInSent(item.internetMessageId ?? row.internet_message_id, row.graph_id);
    return "in_sent";
  }
  if (row.internet_message_id) {
    const found = await deps.graph.call("read", `${deps.graph.mailbox}/mailFolders/sentitems/messages?$filter=${encodeURIComponent(`internetMessageId eq '${row.internet_message_id.replace(/'/g, "''")}'`)}&$select=id`);
    if (((found.json?.value as unknown[]) ?? []).length) {
      await deps.store.markInSent(row.internet_message_id, row.graph_id);
      return "in_sent";
    }
  }
  // Still an unsent draft in the mailbox: proven not sent, back to "draft" so that a
  // person may decide to send again. Otherwise the state stays as it is.
  if (item?.isDraft === true && row.state !== "accepted") {
    await deps.store.setDraftState(id, ["uncertain", "failed"], "draft", actor.id, actor.channel, "verified-not-sent");
    return "draft";
  }
  return row.state;
}

// SMTP accepted the message but its copy in Sent could not be saved: copy only.
export async function retrySentCopy(deps: MailDeps, actor: MailActor, id: number) {
  need(actor, "send");
  const row = await deps.store.draft(id);
  if (!row) throw new MailRefused("Brouillon introuvable.");
  sameProvider(deps, row);
  if (!isImap(deps)) throw new MailRefused("Action réservée à la messagerie Simafri.");
  return retryImapSentCopy(deps, actor, row);
}
// "Uncertain" (SMTP connection cut while sending): only a person who checked with the
// recipient or the server may declare it not sent; it becomes a draft again, journaled.
// Nothing is sent by this action.
export async function confirmNotSent(deps: MailDeps, actor: MailActor, id: number) {
  need(actor, "send");
  const row = await deps.store.draft(id);
  if (!row || row.state !== "uncertain") throw new MailRefused("Seul un envoi incertain peut être déclaré non parti.");
  sameProvider(deps, row);
  if (!(await deps.store.setDraftState(id, ["uncertain"], "draft", actor.id, actor.channel, "confirmed-not-sent")))
    throw new MailRefused("État modifié entre-temps : rechargez la page.");
}

// ---------- Attribution, suppressions, activity ----------
export async function assign(deps: Pick<MailDeps, "store">, actor: MailActor, messageId: number, clientId: number, contactId: number | null) {
  need(actor, "draft");
  try {
    await deps.store.setLink(messageId, clientId, contactId, "manual", actor.id, actor.channel);
  } catch (e) {
    if (e instanceof Error && e.message === "contact-not-in-client") throw new MailRefused("Ce contact n’appartient pas à cette entreprise.");
    throw e;
  }
}
export async function unassign(deps: Pick<MailDeps, "store">, actor: MailActor, messageId: number) {
  need(actor, "draft");
  await deps.store.unlink(messageId, actor.id, actor.channel);
}
export async function liftSuppression(deps: Pick<MailDeps, "store">, actor: MailActor, address: string) {
  need(actor, "send");
  await deps.store.liftSuppression(address, actor.id);
}
// Records an email exchange as a CRM activity (subject and reference only, no body).
export async function logActivity(
  payload: { create: (args: never) => Promise<{ id: number }> },
  user: unknown,
  actor: MailActor,
  input: { clientId: number; contactId?: number | null; subject: string; messageId?: number | null },
) {
  need(actor, "draft");
  const doc = await payload.create({
    collection: "crm-activities",
    data: {
      kind: "email", client: input.clientId, contact: input.contactId ?? null, subject: input.subject.slice(0, 200),
      details: input.messageId ? `Email de contact@ (référence CRM n° ${input.messageId}).` : "",
    },
    user, overrideAccess: false,
  } as never);
  return doc.id;
}
