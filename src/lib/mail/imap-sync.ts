import type { FetchMessageObject, ImapFlow, MessageStructureObject } from "imapflow";
import { ImapMailbox, MailServerError, type Folders } from "./imap";
import { parseMail, referenceList } from "./mime";
import { isLikelyNdr, ndrFailedRecipients, ndrKindFromText, normalizeAddress, parseDsn } from "./rules";
import type { Folder, ImapHeader, MailStore } from "./store";
// Incremental synchronisation of the Inbox and the Sent folder over IMAP. Folders are opened
// read-only (EXAMINE) and messages fetched with BODY.PEEK: nothing is marked read, moved or
// deleted. Per folder: UIDVALIDITY and the last UID seen, saved after every page, so an
// interrupted round resumes where it stopped. A new UIDVALIDITY restarts from the initial
// date; messages are keyed by Message-ID, so nothing is duplicated.
export const IMAP_FOLDERS: { folder: Folder; key: "imap-inbox" | "imap-sentitems" }[] = [
  { folder: "inbox", key: "imap-inbox" },
  { folder: "sentitems", key: "imap-sentitems" },
];
const PAGE = 50;
export const folderPath = (folders: Folders, folder: Folder) => (folder === "inbox" ? folders.inbox : folders.sent);

// Remote key: Message-ID when present (stable across UIDVALIDITY changes), else the location.
export const imapKey = (folder: Folder, messageId: string | null, uidvalidity: bigint, uid: number) =>
  messageId ? `imap:${folder}:${messageId}` : `imap:${folder}:uv${uidvalidity}:${uid}`;

function hasAttachment(node?: MessageStructureObject): boolean {
  if (!node) return false;
  if (node.childNodes?.length) return node.childNodes.some(hasAttachment);
  const type = (node.type ?? "").toLowerCase();
  if (type === "message/delivery-status" || type === "text/rfc822-headers") return false;
  if (node.disposition === "attachment") return true;
  const named = !!(node.dispositionParameters?.filename || node.parameters?.name);
  return named && node.disposition !== "inline" && !node.id;
}
const headerValue = (headers: Buffer | undefined, name: string) => {
  const text = (headers?.toString("utf8") ?? "").replace(/\r?\n[ \t]+/g, " ");
  return text.match(new RegExp(`^${name}:\\s*(.*)$`, "im"))?.[1]?.trim() ?? "";
};
export function toHeader(folder: Folder, uidvalidity: bigint, msg: FetchMessageObject): ImapHeader {
  const env = msg.envelope;
  const messageId = env?.messageId && /^<[^<>\s]+>$/.test(env.messageId) ? env.messageId : null;
  const inReplyTo = referenceList(env?.inReplyTo ?? headerValue(msg.headers, "In-Reply-To"))[0] ?? null;
  const contentType = headerValue(msg.headers, "Content-Type");
  const from = env?.from?.[0];
  const report = /multipart\/report/i.test(contentType) && /delivery-status/i.test(contentType);
  const fromAddress = normalizeAddress(from?.address) || null;
  return {
    key: imapKey(folder, messageId, uidvalidity, msg.uid), uidvalidity, uid: msg.uid, messageId, inReplyTo,
    references: referenceList(headerValue(msg.headers, "References")),
    subject: env?.subject ?? "", from: { address: fromAddress, name: from?.name?.slice(0, 200) || null },
    to: (env?.to ?? []).map((a) => normalizeAddress(a.address)).filter(Boolean),
    cc: (env?.cc ?? []).map((a) => normalizeAddress(a.address)).filter(Boolean),
    receivedAt: msg.internalDate ? new Date(msg.internalDate) : null,
    sentAt: env?.date ? new Date(env.date) : null,
    hasAttachments: hasAttachment(msg.bodyStructure),
    ndr: folder === "inbox" && (report || isLikelyNdr(fromAddress, env?.subject)),
  };
}

export type ImapSyncResult = { folder: Folder; seen: number; removed: number; complete: boolean; reset?: boolean; skipped?: boolean; error?: string };

export async function syncImapFolder(client: ImapFlow, folders: Folders, store: MailStore, folder: Folder, key: "imap-inbox" | "imap-sentitems", sinceDays: number, maxPages = 40, pageSize = PAGE): Promise<ImapSyncResult> {
  const state = await store.claimImapFolder(key, sinceDays);
  if (!state) return { folder, seen: 0, removed: 0, complete: false, skipped: true };
  const path = folderPath(folders, folder);
  let seen = 0, removed = 0, reset = false;
  try {
    const box = await client.mailboxOpen(path, { readOnly: true });
    const uidvalidity = BigInt(box.uidValidity);
    let lastUid = state.last_uid;
    if (state.uidvalidity !== null && (state.uidvalidity !== uidvalidity || state.imap_path !== path)) {
      await store.resetImapFolder(key, path, uidvalidity);
      lastUid = 0;
      reset = true;
    }
    const since = new Date(state.initial_since);
    const inWindow = ((await client.search({ since }, { uid: true })) || []).sort((a, b) => a - b);
    const pending = inWindow.filter((uid) => uid > lastUid);
    let page = 0;
    for (; page < maxPages && pending.length; page++) {
      const uids = pending.splice(0, pageSize);
      const fetched = await client.fetchAll(uids.join(","), {
        uid: true, envelope: true, bodyStructure: true, internalDate: true, headers: ["references", "in-reply-to", "content-type"],
      }, { uid: true });
      for (const msg of fetched.sort((a, b) => a.uid - b.uid)) {
        const header = toHeader(folder, uidvalidity, msg);
        const row = await store.upsertImapMessage(folder, header);
        // A CRM message in Sent: its company and contact were chosen by a person. Only when
        // first seen, so that a later manual attribution is never overwritten.
        if (folder === "sentitems" && row.inserted)
          for (const d of [...(await store.markInSent(header.messageId, header.key)), ...(await store.sentDraftFor(header.messageId))])
            if (d.client_id) await store.setLink(row.id, d.client_id, d.contact_id, "draft", null, "sync").catch(() => store.setLink(row.id, d.client_id!, null, "draft", null, "sync"));
        seen++;
      }
      await store.saveImapProgress(key, path, uidvalidity, Math.max(lastUid, ...uids));
    }
    const complete = !pending.length;
    const top = Math.max(lastUid, ...inWindow, 0);
    await store.saveImapProgress(key, path, uidvalidity, complete ? top : Math.max(lastUid, ...inWindow.filter((u) => !pending.includes(u)), 0));
    if (complete) removed = await store.markImapRemoved(folder, uidvalidity, top, inWindow);
    // Paused by the page limit: progress saved, the next round continues after it.
    await store.finishFolder(key, reset ? "reset:uidvalidity" : null, seen);
    return { folder, seen, removed, complete, reset };
  } catch (error) {
    const code = error instanceof MailServerError ? error.code : "imap-error";
    await store.finishFolder(key, code, seen);
    return { folder, seen, removed, complete: false, reset, error: code };
  }
}

// Delivery reports: the delivery-status part (RFC 3464) gives each failed recipient with its
// status code; the returned headers give our Message-ID. Read once with BODY.PEEK, not kept.
export async function checkImapNdrs(client: ImapFlow, folders: Folders, store: MailStore) {
  const candidates = await store.uncheckedNdr(20, "imap");
  if (!candidates.length) return 0;
  const sentTo = await store.recentSentRecipients();
  const box = await client.mailboxOpen(folders.inbox, { readOnly: true });
  let checked = 0;
  for (const m of candidates) {
    // Gone, moved or too large to read: kept as a report whose recipient is not identified.
    if (!m.imap_uid || String(box.uidValidity) !== m.imap_uidvalidity) { await store.recordNdr(m.id, [], true); continue; }
    const size = await client.fetchOne(String(m.imap_uid), { uid: true, size: true }, { uid: true });
    if (!size || (size.size ?? 0) > 5 * 1024 * 1024) { await store.recordNdr(m.id, [], true); continue; }
    const msg = await client.fetchOne(String(m.imap_uid), { uid: true, source: true }, { uid: true });
    if (!msg || !msg.source) { await store.recordNdr(m.id, [], true); continue; }
    const mail = await parseMail(msg.source);
    const dsn = mail.attachments.find((a) => /^message\/(global-)?delivery-status$/i.test(a.contentType));
    const returned = mail.attachments.find((a) => /^(text\/rfc822-headers|message\/rfc822|message\/global-headers)$/i.test(a.contentType));
    const original = returned ? referenceList(returned.content.toString("utf8").replace(/\r?\n[ \t]+/g, " ").match(/^Message-ID:\s*(\S+)/im)?.[1] ?? "")[0] ?? null : null;
    let failed = dsn ? parseDsn(dsn.content.toString("utf8")).map((r) => ({ address: r.address, kind: r.kind, status: r.status })) : [];
    if (!dsn) {
      const text = mail.text ?? "";
      const kind = ndrKindFromText(text);
      failed = ndrFailedRecipients(text, sentTo).map((address) => ({ address, kind, status: "" }));
    }
    await store.recordNdr(m.id, failed, !!dsn || failed.length > 0, original);
    checked++;
  }
  return checked;
}

export async function imapSyncAll(mailbox: ImapMailbox, store: MailStore, maxPages = 40, pageSize = PAGE) {
  const results: ImapSyncResult[] = [];
  let ndr = 0;
  try {
    await mailbox.session(async (client, folders) => {
      for (const { folder, key } of IMAP_FOLDERS) results.push(await syncImapFolder(client, folders, store, folder, key, mailbox.config.sinceDays, maxPages, pageSize));
      ndr = await checkImapNdrs(client, folders, store);
    });
  } catch (error) {
    const code = error instanceof MailServerError ? error.code : "imap-error";
    for (const { folder, key } of IMAP_FOLDERS)
      if (!results.some((r) => r.folder === folder)) {
        await store.finishFolder(key, code, 0);
        results.push({ folder, seen: 0, removed: 0, complete: false, error: code });
      }
  }
  await store.expireSending();
  const linked = await store.linkPending();
  return { results, linked, ndr };
}
