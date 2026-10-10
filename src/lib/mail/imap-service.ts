import { randomUUID } from "node:crypto";
import type { ImapFlow } from "imapflow";
import { ImapMailbox, MailServerError, smtpPhaseCode, smtpSendOutcome, type Folders } from "./imap";
import { folderPath } from "./imap-sync";
import {
  addressList, attachmentId, attachmentRefusal, buildMime, firstAddress, parseMail, referenceList, safeFilename, senderAddress, sha16,
  visibleAttachments, withDate, type OutgoingAttachment, type ParsedMail,
} from "./mime";
import {
  composeBody, composeFromText, composeText, escapeHtml, ndrKind, quoteHtml, quoteText, sendRefusal, senderRefusal, stripActiveHtml,
} from "./rules";
import type { AttachmentMeta, DraftRow, MailStore, MessageRow } from "./store";
import { MailRefused } from "./errors";
// SMTP/IMAP side of the CRM mailbox functions (Simafri, contact@crm.5sursync.com). Called by
// service.ts after the right check; same promises as the Microsoft side:
// - bodies and attachments stay in the mailbox (Drafts, Inbox, Sent), never in the database;
// - saving a draft never sends; only sendImapDraft talks to the SMTP server, once per claim;
// - a draft changed outside the CRM (webmail, Outlook) is never overwritten or sent;
// - nothing is ever resent automatically, and nothing is deleted except the CRM's own draft
//   once sent or abandoned (UID EXPUNGE of that UID only, UIDPLUS required).
export type ImapDeps = { kind: "imap"; imap: ImapMailbox; store: MailStore; logo: () => Buffer };
const MAX_READ = 30 * 1024 * 1024;

// ---------- Locating messages ----------
// A CRM draft is identified by UIDVALIDITY:UID:hash of the exact bytes written. IMAP
// messages are immutable: a draft edited elsewhere is a new message with another UID.
const draftKey = (uidvalidity: bigint | number | string, uid: number, raw: Buffer) => `${uidvalidity}:${uid}:${sha16(raw)}`;
const parseKey = (key: string | null) => {
  const [uv, uid, hash] = (key ?? "").split(":");
  return uv && uid && hash ? { uidvalidity: uv, uid: Number(uid), hash } : null;
};
type DraftLookup = { state: "ours"; uid: number; source: Buffer } | { state: "edited" | "sent" | "missing" };
async function findDraft(client: ImapFlow, folders: Folders, row: DraftRow): Promise<DraftLookup> {
  const key = parseKey(row.change_key);
  const box = await client.mailboxOpen(folders.drafts, { readOnly: true });
  if (key && String(box.uidValidity) === key.uidvalidity) {
    const msg = await client.fetchOne(String(key.uid), { uid: true, source: true }, { uid: true });
    if (msg && msg.source && sha16(msg.source) === key.hash) return { state: "ours", uid: msg.uid, source: msg.source };
    if (msg && msg.source) return { state: "edited" };
  }
  if (row.internet_message_id) {
    const other = (await client.search({ header: { "message-id": row.internet_message_id } }, { uid: true })) || [];
    if (other.length) return { state: "edited" };
    await client.mailboxOpen(folders.sent, { readOnly: true });
    if (((await client.search({ header: { "message-id": row.internet_message_id } }, { uid: true })) || []).length) return { state: "sent" };
  }
  return { state: "missing" };
}
async function fetchMessage(client: ImapFlow, folders: Folders, row: MessageRow): Promise<Buffer | null> {
  const box = await client.mailboxOpen(folderPath(folders, row.folder), { readOnly: true });
  let uid = row.imap_uid && String(box.uidValidity) === row.imap_uidvalidity ? Number(row.imap_uid) : null;
  if (!uid && row.internet_message_id) uid = ((await client.search({ header: { "message-id": row.internet_message_id } }, { uid: true })) || [])[0] ?? null;
  if (!uid) return null;
  const meta = await client.fetchOne(String(uid), { uid: true, size: true }, { uid: true });
  if (!meta) return null;
  if ((meta.size ?? 0) > MAX_READ) throw new MailRefused("Message trop volumineux pour le CRM (30 Mo au plus) : ouvrez-le dans le webmail.");
  const msg = await client.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
  return msg && msg.source ? msg.source : null;
}
// APPEND, then the exact UID: from APPENDUID (UIDPLUS) or a search on our Message-ID.
async function appendDraft(client: ImapFlow, folders: Folders, raw: Buffer, messageId: string) {
  const res = await client.append(folders.drafts, raw, ["\\Draft", "\\Seen"]);
  const box = await client.mailboxOpen(folders.drafts, { readOnly: true });
  let uid = res && res.uid && res.uidValidity !== undefined && BigInt(res.uidValidity) === BigInt(box.uidValidity) ? res.uid : null;
  if (!uid) uid = Math.max(0, ...(((await client.search({ header: { "message-id": messageId } }, { uid: true })) || [])));
  const stored = uid ? await client.fetchOne(String(uid), { uid: true, source: true }, { uid: true }) : null;
  if (!uid || !stored || !stored.source) throw new MailServerError("draft-not-found-after-append");
  return draftKey(box.uidValidity, uid, stored.source);
}
// Removes one message of ours, by UID only. Without UIDPLUS a plain EXPUNGE could remove
// other messages flagged \Deleted: then nothing is removed.
async function removeOwn(client: ImapFlow, folders: Folders, path: string, uid: number) {
  if (!folders.uidplus) return false;
  await client.mailboxOpen(path);
  return client.messageDelete(String(uid), { uid: true });
}

// ---------- Composition ----------
const domainOf = (address: string) => address.split("@")[1] ?? "crm.5sursync.com";
const newMessageId = (address: string) => `<crm-${randomUUID()}@${domainOf(address)}>`;
// Checked here for every entry point (CRM forms, a future Charlie connection).
function checkAttachments(list: OutgoingAttachment[]) {
  const refusal = attachmentRefusal(list.map((a) => ({ name: a.filename, size: a.content.length })));
  if (refusal) throw new MailRefused(refusal);
}
const meta = (list: OutgoingAttachment[]): AttachmentMeta[] => list.map((a) => ({ name: a.filename, size: a.content.length, contentType: a.contentType }));
export type UploadedFile = { name: string; type: string; size: number; bytes: () => Promise<ArrayBuffer> };
export async function readUploads(files: UploadedFile[]) {
  const real = files.filter((f) => f.size > 0 && f.name);
  const refusal = attachmentRefusal(real);
  if (refusal) throw new MailRefused(refusal);
  return Promise.all(real.map(async (f) => ({
    filename: safeFilename(f.name),
    // The declared type is not trusted for display anywhere; kept for the recipient's client.
    contentType: /^[\w.+-]+\/[\w.+-]+$/.test(f.type) ? f.type : "application/octet-stream",
    content: Buffer.from(await f.bytes()),
  })));
}
type Quote = { html: string; text: string };
async function originalQuote(client: ImapFlow, folders: Folders, original: MessageRow): Promise<{ quote: Quote; mail: ParsedMail } | null> {
  const source = await fetchMessage(client, folders, original);
  if (!source) return null;
  const mail = await parseMail(source);
  const date = original.received_at ?? original.sent_at;
  const text = mail.text ?? "";
  const html = mail.html || `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`;
  return {
    mail,
    quote: {
      html: quoteHtml({ fromName: original.from_name, fromAddress: original.from_address, date, html }),
      text: quoteText({ fromName: original.from_name, fromAddress: original.from_address, date, text }),
    },
  };
}
function compose(deps: ImapDeps, d: { to: string[]; cc: string[]; subject: string; text: string; messageId: string; inReplyTo?: string | null; references?: string[]; attachments: OutgoingAttachment[]; quote?: Quote | null }) {
  const c = deps.imap.config;
  return buildMime({
    from: { name: c.displayName, address: c.mailboxAddress }, to: d.to, cc: d.cc, subject: d.subject,
    text: composeText(d.text, c.mailboxAddress, d.quote?.text ?? ""),
    html: composeBody(d.text, d.quote?.html ?? "", c.mailboxAddress),
    messageId: d.messageId, inReplyTo: d.inReplyTo, references: d.references, attachments: d.attachments, logo: deps.logo(),
  });
}

// ---------- Read ----------
export async function readImapMessage(deps: ImapDeps, row: MessageRow, format: "text" | "html") {
  return deps.imap.session(async (client, folders) => {
    const source = await fetchMessage(client, folders, row);
    if (!source) return null;
    const mail = await parseMail(source);
    const body = format === "html" ? stripActiveHtml(mail.html || `<pre>${escapeHtml(mail.text ?? "")}</pre>`) : mail.text ?? "";
    const attachments = visibleAttachments(mail).map(({ a, index }) => ({
      id: attachmentId(index, a), name: a.filename || "piece-jointe", contentType: a.contentType, size: a.size, isInline: false,
    }));
    return { body, attachments };
  });
}
export async function imapAttachment(deps: ImapDeps, row: MessageRow, id: string) {
  return deps.imap.session(async (client, folders) => {
    const source = await fetchMessage(client, folders, row);
    if (!source) return null;
    const mail = await parseMail(source);
    const found = visibleAttachments(mail).find(({ a, index }) => attachmentId(index, a) === id);
    if (!found) return null;
    if (found.a.size > 25 * 1024 * 1024) throw new MailRefused("Pièce jointe trop volumineuse (25 Mo au plus) : ouvrez-la dans le webmail.");
    const bytes = found.a.content;
    return { name: found.a.filename || "piece-jointe", bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer };
  });
}
export async function readImapDraft(deps: ImapDeps, row: DraftRow) {
  return deps.imap.session(async (client, folders) => {
    const found = await findDraft(client, folders, row);
    if (found.state === "ours") {
      const mail = await parseMail(found.source);
      return { text: composeFromText(mail.text ?? ""), outlookEdited: false, missing: false };
    }
    if (row.state !== "draft") {
      // Sent: the copy in Sent, if any.
      if (row.internet_message_id) {
        await client.mailboxOpen(folders.sent, { readOnly: true });
        const uid = ((await client.search({ header: { "message-id": row.internet_message_id } }, { uid: true })) || [])[0];
        const msg = uid ? await client.fetchOne(String(uid), { uid: true, source: true }, { uid: true }) : null;
        if (msg && msg.source) return { text: composeFromText((await parseMail(msg.source)).text ?? ""), outlookEdited: false, missing: false };
      }
      return { text: null, outlookEdited: false, missing: false };
    }
    return { text: null, outlookEdited: found.state === "edited", missing: found.state !== "edited" };
  });
}

// ---------- Drafts (never send) ----------
export async function prepareImapDraft(deps: ImapDeps, actor: { id: number; channel: string }, v: { to: string[]; cc: string[]; subject: string }, input: { clientId: number | null; contactId: number | null; text: string }, attachments: OutgoingAttachment[]) {
  checkAttachments(attachments);
  const messageId = newMessageId(deps.imap.config.mailboxAddress);
  const raw = await compose(deps, { ...v, text: input.text, messageId, attachments });
  const changeKey = await deps.imap.session((client, folders) => appendDraft(client, folders, raw, messageId));
  return deps.store.insertDraft({
    graphId: `imap-draft:${messageId}`, internetMessageId: messageId, conversationId: messageId, changeKey, kind: "new", replyTo: null,
    clientId: input.clientId, contactId: input.contactId, to: v.to, cc: v.cc, subject: v.subject, adminId: actor.id, channel: actor.channel,
    provider: "imap", attachments: meta(attachments),
  });
}
// A reply in the thread: In-Reply-To = the original Message-ID, References = its references
// followed by it, To = its Reply-To or From, subject "RE: …", the original quoted.
export async function prepareImapReply(deps: ImapDeps, actor: { id: number; channel: string }, original: MessageRow, text: string, attachments: OutgoingAttachment[]) {
  checkAttachments(attachments);
  const mailbox = deps.imap.config.mailboxAddress;
  const messageId = newMessageId(mailbox);
  const { changeKey, to, subject, inReplyTo, references } = await deps.imap.session(async (client, folders) => {
    const found = await originalQuote(client, folders, original);
    if (!found) throw new MailRefused("Message d’origine introuvable dans la boîte (supprimé ou déplacé ?).");
    const { mail, quote } = found;
    const replyTo = addressList(mail.replyTo).filter((a) => a !== mailbox);
    const to = original.folder === "sentitems" ? original.to_addresses : replyTo.length ? replyTo : [firstAddress(mail.from).address ?? original.from_address ?? ""].filter(Boolean);
    if (!to.length) throw new MailRefused("Aucune adresse de réponse dans le message d’origine.");
    const base = (mail.subject ?? original.subject ?? "").trim();
    const subject = /^re\s*:/i.test(base) ? base : `RE: ${base}`;
    const inReplyTo = mail.messageId ?? original.internet_message_id;
    const references = [...referenceList(mail.references), ...(inReplyTo ? [inReplyTo] : [])].slice(-30);
    const raw = await compose(deps, { to, cc: [], subject, text, messageId, inReplyTo, references, attachments, quote });
    return { changeKey: await appendDraft(client, folders, raw, messageId), to, subject, inReplyTo: inReplyTo ?? null, references };
  });
  return deps.store.insertDraft({
    graphId: `imap-draft:${messageId}`, internetMessageId: messageId, conversationId: original.conversation_id ?? inReplyTo ?? messageId, changeKey,
    kind: "reply", replyTo: original.id, clientId: original.client_id, contactId: original.contact_id, to, cc: [], subject: subject.slice(0, 300),
    adminId: actor.id, channel: actor.channel, provider: "imap", inReplyTo, references, attachments: meta(attachments),
  });
}
const EDITED = "Ce brouillon a été modifié dans le webmail ou Outlook : le CRM ne l’écrase pas. Terminez-le là-bas.";
export async function updateImapDraft(deps: ImapDeps, actor: { id: number; channel: string }, row: DraftRow, v: { to: string[]; cc: string[]; subject: string }, text: string, added: OutgoingAttachment[], removeNames: string[]) {
  await deps.imap.session(async (client, folders) => {
    if (!folders.uidplus) throw new MailRefused("Le serveur ne permet pas de remplacer un brouillon sans risque (UIDPLUS absent).");
    const found = await findDraft(client, folders, row);
    if (found.state !== "ours") throw new MailRefused(found.state === "edited" ? EDITED : "Ce brouillon n’est plus dans le dossier Brouillons (envoyé ou supprimé ailleurs ?). Utilisez « Vérifier l’état ».");
    const old = await parseMail(found.source);
    const kept: OutgoingAttachment[] = visibleAttachments(old)
      .filter(({ a }) => !removeNames.includes(a.filename ?? ""))
      .map(({ a }) => ({ filename: safeFilename(a.filename ?? "piece-jointe"), contentType: a.contentType, content: a.content }));
    const all = [...kept, ...added];
    checkAttachments(all);
    const original = row.kind === "reply" && row.reply_to ? await deps.store.message(row.reply_to) : null;
    const quote = original ? (await originalQuote(client, folders, original))?.quote ?? null : null;
    const messageId = row.internet_message_id ?? newMessageId(deps.imap.config.mailboxAddress);
    const raw = await compose(deps, { ...v, text, messageId, inReplyTo: row.in_reply_to, references: row.references_ids, attachments: all, quote });
    // New version first, then the old one removed: a failure in between leaves two drafts,
    // never none. The CRM points at the new one.
    const changeKey = await appendDraft(client, folders, raw, messageId);
    await deps.store.updateDraftMeta(row.id, { ...v, changeKey, internetMessageId: messageId, adminId: actor.id, channel: actor.channel, attachments: meta(all) });
    await removeOwn(client, folders, folders.drafts, found.uid);
  });
}
export async function discardImapDraft(deps: ImapDeps, row: DraftRow) {
  await deps.imap.session(async (client, folders) => {
    const found = await findDraft(client, folders, row);
    // Only the CRM's own, unchanged draft is removed; an edited one stays in the mailbox.
    if (found.state === "ours") await removeOwn(client, folders, folders.drafts, found.uid);
  });
}

// ---------- Send ----------
type SendCheck = { source: Buffer; recipients: string[]; uid: number };
// Recipients and sender as they are in the draft now, before any SMTP connection.
async function checkDraftForSend(deps: ImapDeps, row: DraftRow): Promise<SendCheck> {
  const mailbox = deps.imap.config.mailboxAddress;
  return deps.imap.session(async (client, folders) => {
    const found = await findDraft(client, folders, row);
    if (found.state !== "ours")
      throw new MailRefused(found.state === "edited" ? `Envoi bloqué : ${EDITED}`
        : found.state === "sent" ? "Ce message figure déjà dans Envoyés : vérifiez avant toute nouvelle action."
        : `Envoi bloqué : ce brouillon est introuvable dans le dossier Brouillons de ${mailbox}.`);
    const mail = await parseMail(found.source);
    const wrong = senderRefusal(firstAddress(mail.from).address, senderAddress(mail), mailbox);
    if (wrong) throw new MailRefused(wrong);
    if (addressList(mail.bcc).length) throw new MailRefused("Envoi bloqué : copie cachée (Cci) non prévue par le CRM.");
    if (mail.messageId !== row.internet_message_id) throw new MailRefused("Envoi bloqué : identifiant du message inattendu.");
    const recipients = [...new Set([...addressList(mail.to), ...addressList(mail.cc)])];
    return { source: found.source, recipients, uid: found.uid };
  });
}
export async function sendImapDraft(deps: ImapDeps, actor: { id: number; channel: string }, row: DraftRow) {
  const { store } = deps;
  const mailbox = deps.imap.config.mailboxAddress;
  const check = await checkDraftForSend(deps, row);
  const refusal = sendRefusal(check.recipients, deps.imap.config.sendAllowlist, await store.suppressed(check.recipients), mailbox);
  if (refusal) throw new MailRefused(refusal);
  const claimed = await store.claimSend(row.id, actor.id, actor.channel);
  if (!claimed) throw new MailRefused("Envoi déjà demandé pour ce brouillon.");
  const raw = withDate(check.source, new Date());
  const outcome = await deps.imap.smtpSession(
    async (send) => {
      try {
        const info = await send({ from: mailbox, to: check.recipients }, raw);
        if (!info.accepted.length) return { state: "failed" as const, code: "smtp-no-recipient-accepted", rejected: info.rejectedErrors ?? [] };
        return { state: "accepted" as const, code: "smtp-250", rejected: info.rejectedErrors ?? [] };
      } catch (e) {
        return { ...smtpSendOutcome(e), rejected: [] };
      }
    },
    (phase, e) => ({ state: "failed" as const, code: smtpPhaseCode(phase, e), rejected: [] }),
  );
  const rejected = outcome.rejected.map((r) => ({ address: String(r.recipient ?? "").toLowerCase(), kind: ndrKind(null, r.response ?? String(r.responseCode ?? "")), status: String(r.responseCode ?? "") })).filter((r) => r.address);
  await store.finishSend(row.id, claimed.claim!, outcome.state, outcome.code, actor.id, actor.channel, rejected.length ? { rejected: rejected.map((r) => r.address) } : {});
  if (outcome.state !== "accepted") return outcome.state;
  await store.recordRejected(row.id, rejected);
  // Accepted by SMTP. From here on, nothing can send it again: only the copy in Sent and
  // the removal of our draft remain, each recorded separately.
  return saveCopy(deps, actor, row, raw);
}
async function saveCopy(deps: ImapDeps, actor: { id: number; channel: string } | null, row: DraftRow, raw: Buffer | null): Promise<DraftRow["state"]> {
  const { store } = deps;
  try {
    return await deps.imap.session(async (client, folders) => {
      await client.mailboxOpen(folders.sent, { readOnly: true });
      const already = ((await client.search({ header: { "message-id": row.internet_message_id ?? "" } }, { uid: true })) || []).length > 0;
      const found = await findDraft(client, folders, row);
      if (!already) {
        const source = raw ?? (found.state === "ours" ? found.source : null);
        if (!source) throw new MailServerError("no-source-for-copy");
        await client.append(folders.sent, source, ["\\Seen"]);
      }
      await store.setSentCopy(row.id, already ? "found" : "saved", actor?.id ?? null, actor?.channel ?? "crm");
      if (found.state === "ours" && (await removeOwn(client, folders, folders.drafts, found.uid)))
        await store.event("draft-removed", { adminId: actor?.id ?? null, channel: actor?.channel ?? "crm", draftId: row.id });
      return "in_sent" as const;
    });
  } catch {
    await store.setSentCopy(row.id, "failed", actor?.id ?? null, actor?.channel ?? "crm");
    return "accepted";
  }
}
// Accepted by SMTP but the copy in Sent failed: copy only, never a new SMTP send.
export async function retryImapSentCopy(deps: ImapDeps, actor: { id: number; channel: string }, row: DraftRow) {
  if (row.state !== "accepted" || row.sent_copy !== "failed") throw new MailRefused("Aucune copie en attente pour ce message.");
  return saveCopy(deps, actor, row, null);
}
// Read-only check. A failed SMTP send with our draft still in Drafts goes back to "draft"
// (the server answered: nothing left). An uncertain one stays uncertain unless its copy is
// found in Sent: a draft still present proves nothing about an interrupted SMTP session.
export async function verifyImapDraft(deps: ImapDeps, actor: { id: number; channel: string }, row: DraftRow) {
  return deps.imap.session(async (client, folders) => {
    if (row.internet_message_id) {
      await client.mailboxOpen(folders.sent, { readOnly: true });
      if (((await client.search({ header: { "message-id": row.internet_message_id } }, { uid: true })) || []).length) {
        await deps.store.setSentCopy(row.id, "found", actor.id, actor.channel);
        return "in_sent" as const;
      }
    }
    if (row.state === "failed" && (await findDraft(client, folders, row)).state === "ours") {
      await deps.store.setDraftState(row.id, ["failed"], "draft", actor.id, actor.channel, "verified-not-sent");
      return "draft" as const;
    }
    return row.state;
  });
}
