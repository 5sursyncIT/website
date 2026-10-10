import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { counterpartAddresses, decideLink, normalizeAddress, type LinkDecision } from "./rules";
// PostgreSQL side of the mailbox link (schema crm_mail, production database only).
// Identifiers and metadata only: never a body, a preview or an attachment. Both providers
// share the tables; IMAP rows carry provider='imap' and keys "imap:<folder>:<Message-ID>".

export type Folder = "inbox" | "sentitems";
export type Recipient = { emailAddress?: { address?: string; name?: string } };
export type GraphMessage = {
  id: string;
  internetMessageId?: string;
  conversationId?: string;
  subject?: string;
  from?: Recipient;
  toRecipients?: Recipient[];
  ccRecipients?: Recipient[];
  receivedDateTime?: string;
  sentDateTime?: string;
  hasAttachments?: boolean;
  isDraft?: boolean;
};
export type MessageRow = {
  id: number; graph_id: string; internet_message_id: string | null; conversation_id: string | null; folder: Folder;
  from_address: string | null; from_name: string | null; to_addresses: string[]; cc_addresses: string[]; subject: string;
  received_at: Date | null; sent_at: Date | null; has_attachments: boolean; is_ndr: boolean; ndr_recipients: string[];
  link_state: string; removed_at: Date | null; client_id: number | null; contact_id: number | null; link_method: string | null;
  provider: "graph" | "imap"; imap_uidvalidity: string | null; imap_uid: string | null; in_reply_to: string | null; references_ids: string[]; ndr_kind: string | null;
};
// One message as read from IMAP (envelope and threading headers only).
export type ImapHeader = {
  key: string; uidvalidity: bigint; uid: number; messageId: string | null; inReplyTo: string | null; references: string[];
  subject: string; from: { address: string | null; name: string | null }; to: string[]; cc: string[];
  receivedAt: Date | null; sentAt: Date | null; hasAttachments: boolean; ndr: boolean;
};
export type AttachmentMeta = { name: string; size: number; contentType: string };
export type DraftRow = {
  id: number; graph_id: string; internet_message_id: string | null; conversation_id: string | null; kind: "new" | "reply";
  reply_to: number | null; client_id: number | null; contact_id: number | null; to_addresses: string[]; cc_addresses: string[];
  subject: string; change_key: string | null; state: string; prepared_by: number | null; prepared_at: Date; updated_by: number | null; updated_at: Date;
  submitted_by: number | null; submitted_at: Date | null; send_requested_by: number | null; send_requested_at: Date | null;
  claim: string | null; lease_until: Date | null; accepted_at: Date | null; in_sent_at: Date | null; failure_code: string | null;
  delivery_failed_at: Date | null; delivery_failed_for: string[];
  provider: "graph" | "imap"; in_reply_to: string | null; references_ids: string[]; attachments: AttachmentMeta[];
  sent_copy: "saved" | "found" | "failed" | null; delivery_failure_kind: string | null;
};
export type FailedRecipient = { address: string; kind: string; status?: string };
const addresses = (list?: Recipient[]) => (list ?? []).map((r) => normalizeAddress(r.emailAddress?.address)).filter(Boolean);
const MESSAGE_SELECT = `m.*, l.client_id, l.contact_id, l.method AS link_method`;

export class MailStore {
  constructor(readonly pool: Pool, readonly mailbox: string) {}
  private q<T = Record<string, unknown>>(text: string, values?: unknown[], client?: PoolClient) {
    return (client ?? this.pool).query(text, values) as unknown as Promise<{ rows: T[]; rowCount: number }>;
  }

  async event(action: string, e: { adminId?: number | null; channel?: string; draftId?: number | null; messageId?: number | null; detail?: Record<string, unknown> }, client?: PoolClient) {
    await this.q(`INSERT INTO crm_mail.events(admin_id,channel,action,draft_id,message_id,detail) VALUES($1,$2,$3,$4,$5,$6)`,
      [e.adminId ?? null, e.channel ?? "crm", action, e.draftId ?? null, e.messageId ?? null, JSON.stringify(e.detail ?? {})], client);
  }

  // ---------- Synchronisation state (one lease per folder) ----------
  async claimFolder(folder: Folder, sinceDays: number, leaseSeconds = 300) {
    await this.q(`INSERT INTO crm_mail.sync_state(folder,initial_since) VALUES($1,NOW()-($2||' days')::interval) ON CONFLICT DO NOTHING`, [folder, String(sinceDays)]);
    const { rows } = await this.q<{ folder: Folder; initial_since: Date; delta_link: string | null; next_link: string | null }>(
      `UPDATE crm_mail.sync_state SET lease_until=NOW()+($2||' seconds')::interval, last_run_at=NOW()
       WHERE folder=$1 AND (lease_until IS NULL OR lease_until<NOW()) RETURNING folder,initial_since,delta_link,next_link`,
      [folder, String(leaseSeconds)]);
    return rows[0] ?? null;
  }
  saveNext(folder: Folder, link: string) {
    return this.q(`UPDATE crm_mail.sync_state SET next_link=$2 WHERE folder=$1`, [folder, link]);
  }
  saveDelta(folder: Folder, link: string) {
    return this.q(`UPDATE crm_mail.sync_state SET delta_link=$2,next_link=NULL WHERE folder=$1`, [folder, link]);
  }
  // Microsoft lost the sync state: start again from the same initial date (no duplicates:
  // messages are keyed by their immutable identifier).
  resetFolder(folder: Folder) {
    return this.q(`UPDATE crm_mail.sync_state SET delta_link=NULL,next_link=NULL WHERE folder=$1`, [folder]);
  }
  finishFolder(folder: string, error: string | null, seen: number) {
    return error
      ? this.q(`UPDATE crm_mail.sync_state SET lease_until=NULL,last_error=$2,last_error_at=NOW(),messages_seen=messages_seen+$3 WHERE folder=$1`, [folder, error.slice(0, 200), seen])
      : this.q(`UPDATE crm_mail.sync_state SET lease_until=NULL,last_success_at=NOW(),last_error=NULL,messages_seen=messages_seen+$2 WHERE folder=$1`, [folder, seen]);
  }
  async syncStates(provider: "graph" | "imap" = "graph") {
    return (await this.q<{ folder: string; initial_since: Date; last_run_at: Date | null; last_success_at: Date | null; last_error: string | null; last_error_at: Date | null; messages_seen: string; complete: boolean; imap_path: string | null; uidvalidity: string | null; last_uid: string }>(
      `SELECT folder,initial_since,last_run_at,last_success_at,last_error,last_error_at,messages_seen,imap_path,uidvalidity,last_uid,
         CASE WHEN folder LIKE 'imap-%' THEN last_success_at IS NOT NULL ELSE delta_link IS NOT NULL AND next_link IS NULL END AS complete
       FROM crm_mail.sync_state WHERE (folder LIKE 'imap-%') = $1 ORDER BY folder`, [provider === "imap"])).rows;
  }

  // ---------- IMAP synchronisation state (UIDVALIDITY + last UID, one lease per folder) ----------
  async claimImapFolder(key: "imap-inbox" | "imap-sentitems", sinceDays: number, leaseSeconds = 300) {
    await this.q(`INSERT INTO crm_mail.sync_state(folder,initial_since) VALUES($1,NOW()-($2||' days')::interval) ON CONFLICT DO NOTHING`, [key, String(sinceDays)]);
    const { rows } = await this.q<{ initial_since: Date; imap_path: string | null; uidvalidity: string | null; last_uid: string }>(
      `UPDATE crm_mail.sync_state SET lease_until=NOW()+($2||' seconds')::interval, last_run_at=NOW()
       WHERE folder=$1 AND (lease_until IS NULL OR lease_until<NOW()) RETURNING initial_since,imap_path,uidvalidity,last_uid`,
      [key, String(leaseSeconds)]);
    return rows[0] ? { ...rows[0], uidvalidity: rows[0].uidvalidity === null ? null : BigInt(rows[0].uidvalidity), last_uid: Number(rows[0].last_uid) } : null;
  }
  // Saved after every page: an interrupted round resumes after the last UID recorded.
  saveImapProgress(key: string, path: string, uidvalidity: bigint, lastUid: number) {
    return this.q(`UPDATE crm_mail.sync_state SET imap_path=$2, uidvalidity=$3, last_uid=GREATEST(CASE WHEN uidvalidity=$3 THEN last_uid ELSE 0 END,$4) WHERE folder=$1`,
      [key, path, uidvalidity.toString(), lastUid]);
  }
  // UIDVALIDITY changed (folder recreated, server migration): every UID is void. Start again
  // from the same initial date; messages are keyed by Message-ID, so no duplicate appears.
  resetImapFolder(key: string, path: string, uidvalidity: bigint) {
    return this.q(`UPDATE crm_mail.sync_state SET imap_path=$2, uidvalidity=$3, last_uid=0 WHERE folder=$1`, [key, path, uidvalidity.toString()]);
  }
  async upsertImapMessage(folder: Folder, m: ImapHeader) {
    const conversation = await this.conversationFor(m.messageId, m.inReplyTo, m.references);
    const { rows } = await this.q<{ id: number; inserted: boolean }>(
      `INSERT INTO crm_mail.messages(graph_id,internet_message_id,conversation_id,folder,from_address,from_name,to_addresses,cc_addresses,subject,received_at,sent_at,has_attachments,is_ndr,
         provider,imap_uidvalidity,imap_uid,in_reply_to,references_ids)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'imap',$14,$15,$16,$17)
       ON CONFLICT (graph_id) DO UPDATE SET imap_uidvalidity=EXCLUDED.imap_uidvalidity, imap_uid=EXCLUDED.imap_uid, removed_at=NULL, updated_at=NOW()
       RETURNING id, (xmax = 0) AS inserted`,
      [m.key.slice(0, 1000), m.messageId, conversation, folder, m.from.address, m.from.name, JSON.stringify(m.to), JSON.stringify(m.cc),
        m.subject.slice(0, 500), m.receivedAt, m.sentAt, m.hasAttachments, m.ndr, m.uidvalidity.toString(), m.uid, m.inReplyTo, JSON.stringify(m.references.slice(-50))]);
    return rows[0];
  }
  // Thread of a message: the thread of a known message it answers or refers to, otherwise
  // the first reference (the root, RFC 5322), otherwise the message itself.
  async conversationFor(messageId: string | null, inReplyTo: string | null, references: string[]) {
    const related = [...new Set([inReplyTo, ...references].filter((r): r is string => !!r))];
    if (related.length) {
      const { rows } = await this.q<{ conversation_id: string }>(
        `SELECT conversation_id FROM (
           SELECT conversation_id, internet_message_id FROM crm_mail.messages WHERE internet_message_id = ANY($1::text[]) AND conversation_id IS NOT NULL
           UNION ALL SELECT conversation_id, internet_message_id FROM crm_mail.drafts WHERE internet_message_id = ANY($1::text[]) AND conversation_id IS NOT NULL) x
         ORDER BY array_position($1::text[], internet_message_id) LIMIT 1`, [related]);
      if (rows[0]) return rows[0].conversation_id;
    }
    return references[0] ?? inReplyTo ?? messageId;
  }
  // Messages no longer in the folder (deleted or moved by a person), or not found again after
  // a UIDVALIDITY change: marked, history and attributions kept.
  async markImapRemoved(folder: Folder, uidvalidity: bigint, upToUid: number, present: number[]) {
    const r = await this.q(
      `UPDATE crm_mail.messages SET removed_at=NOW(), updated_at=NOW() WHERE provider='imap' AND folder=$1 AND removed_at IS NULL
         AND ((imap_uidvalidity=$2 AND imap_uid<=$3 AND NOT (imap_uid = ANY($4::bigint[]))) OR imap_uidvalidity<>$2)`, [folder, uidvalidity.toString(), upToUid, present]);
    return r.rowCount;
  }

  // ---------- Messages ----------
  async upsertMessage(folder: Folder, m: GraphMessage, flags: { ndr: boolean }) {
    const { rows } = await this.q<{ id: number; inserted: boolean }>(
      `INSERT INTO crm_mail.messages(graph_id,internet_message_id,conversation_id,folder,from_address,from_name,to_addresses,cc_addresses,subject,received_at,sent_at,has_attachments,is_ndr)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (graph_id) DO UPDATE SET internet_message_id=EXCLUDED.internet_message_id, conversation_id=EXCLUDED.conversation_id,
         folder=EXCLUDED.folder, from_address=EXCLUDED.from_address, from_name=EXCLUDED.from_name, to_addresses=EXCLUDED.to_addresses,
         cc_addresses=EXCLUDED.cc_addresses, subject=EXCLUDED.subject, received_at=EXCLUDED.received_at, sent_at=EXCLUDED.sent_at,
         has_attachments=EXCLUDED.has_attachments, removed_at=NULL, updated_at=NOW()
       RETURNING id, (xmax = 0) AS inserted`,
      [m.id, m.internetMessageId ?? null, m.conversationId ?? null, folder, normalizeAddress(m.from?.emailAddress?.address) || null,
        m.from?.emailAddress?.name?.slice(0, 200) ?? null, JSON.stringify(addresses(m.toRecipients)), JSON.stringify(addresses(m.ccRecipients)),
        (m.subject ?? "").slice(0, 500), m.receivedDateTime ?? null, m.sentDateTime ?? null, !!m.hasAttachments, flags.ndr]);
    return rows[0];
  }
  markRemoved(graphId: string) {
    return this.q(`UPDATE crm_mail.messages SET removed_at=COALESCE(removed_at,NOW()),updated_at=NOW() WHERE graph_id=$1`, [graphId]);
  }
  async message(id: number) {
    return (await this.q<MessageRow>(`SELECT ${MESSAGE_SELECT} FROM crm_mail.messages m LEFT JOIN crm_mail.links l ON l.message_id=m.id WHERE m.id=$1`, [id])).rows[0] ?? null;
  }
  async messagesFor(where: { clientId?: number; contactId?: number }, limit = 50) {
    const [col, value] = where.contactId ? ["l.contact_id", where.contactId] : ["l.client_id", where.clientId];
    return (await this.q<MessageRow>(
      `SELECT ${MESSAGE_SELECT} FROM crm_mail.messages m JOIN crm_mail.links l ON l.message_id=m.id
       WHERE ${col}=$1 ORDER BY COALESCE(m.received_at,m.sent_at) DESC LIMIT $2`, [value, limit])).rows;
  }
  async unassigned(limit = 100) {
    return (await this.q<MessageRow>(
      `SELECT ${MESSAGE_SELECT} FROM crm_mail.messages m LEFT JOIN crm_mail.links l ON l.message_id=m.id
       WHERE l.message_id IS NULL AND m.link_state IN ('ambiguous','unknown') AND m.removed_at IS NULL
       ORDER BY COALESCE(m.received_at,m.sent_at) DESC LIMIT $1`, [limit])).rows;
  }
  async thread(conversationId: string | null, limit = 30) {
    if (!conversationId) return [];
    return (await this.q<MessageRow>(`SELECT ${MESSAGE_SELECT} FROM crm_mail.messages m LEFT JOIN crm_mail.links l ON l.message_id=m.id
      WHERE m.conversation_id=$1 ORDER BY COALESCE(m.received_at,m.sent_at) LIMIT $2`, [conversationId, limit])).rows;
  }

  // ---------- Linking ----------
  // Exact address matches in the CRM (contacts first, then company addresses).
  async matches(addressesList: string[]) {
    if (!addressesList.length) return { contacts: [], clientIds: [] };
    const contacts = (await this.q<{ id: number; client_id: number }>(
      `SELECT id, client_id FROM crm_contacts WHERE lower(email) = ANY($1::text[])`, [addressesList])).rows;
    const clients = (await this.q<{ id: number }>(`SELECT id FROM clients WHERE lower(email) = ANY($1::text[])`, [addressesList])).rows;
    return { contacts: contacts.map((c) => ({ id: c.id, clientId: c.client_id })), clientIds: clients.map((c) => c.id) };
  }
  async decide(row: Pick<MessageRow, "folder" | "from_address" | "to_addresses" | "cc_addresses">): Promise<LinkDecision> {
    const list = counterpartAddresses({ folder: row.folder, from: row.from_address, to: row.to_addresses, cc: row.cc_addresses }, this.mailbox);
    const { contacts, clientIds } = await this.matches(list);
    return decideLink(contacts, clientIds);
  }
  async linkPending(limit = 200) {
    const pending = (await this.q<MessageRow>(
      `SELECT m.* FROM crm_mail.messages m LEFT JOIN crm_mail.links l ON l.message_id=m.id
       WHERE m.link_state='pending' AND l.message_id IS NULL ORDER BY m.id LIMIT $1`, [limit])).rows;
    for (const row of pending) {
      const d = await this.decide(row);
      if (d.state === "linked") await this.setLink(row.id, d.clientId, d.contactId, "auto", null);
      else await this.q(`UPDATE crm_mail.messages SET link_state=$2 WHERE id=$1 AND link_state='pending'`, [row.id, d.state]);
    }
    return pending.length;
  }
  async setLink(messageId: number, clientId: number, contactId: number | null, method: "auto" | "manual" | "draft", adminId: number | null, channel = "crm") {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (contactId !== null) {
        const ok = await client.query(`SELECT 1 FROM crm_contacts WHERE id=$1 AND client_id=$2`, [contactId, clientId]);
        if (!ok.rowCount) throw new Error("contact-not-in-client");
      }
      await client.query(
        `INSERT INTO crm_mail.links(message_id,client_id,contact_id,method,linked_by) VALUES($1,$2,$3,$4,$5)
         ON CONFLICT (message_id) DO UPDATE SET client_id=EXCLUDED.client_id, contact_id=EXCLUDED.contact_id, method=EXCLUDED.method, linked_by=EXCLUDED.linked_by, linked_at=NOW()`,
        [messageId, clientId, contactId, method, adminId]);
      await client.query(`UPDATE crm_mail.messages SET link_state='linked' WHERE id=$1`, [messageId]);
      if (method !== "auto") await this.event("link", { adminId, channel, messageId, detail: { clientId, contactId, method } }, client);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  async unlink(messageId: number, adminId: number, channel = "crm") {
    await this.q(`DELETE FROM crm_mail.links WHERE message_id=$1`, [messageId]);
    await this.q(`UPDATE crm_mail.messages SET link_state='unknown' WHERE id=$1`, [messageId]);
    await this.event("unlink", { adminId, channel, messageId });
  }
  // Manual attribution help: same company domain (public mail providers excluded).
  async domainSuggestions(domain: string | null, limit = 5) {
    if (!domain) return [];
    return (await this.q<{ id: number; name: string }>(
      `SELECT DISTINCT c.id, c.name FROM clients c LEFT JOIN crm_contacts k ON k.client_id=c.id
       WHERE split_part(lower(c.email),'@',2)=$1 OR split_part(lower(k.email),'@',2)=$1
          OR regexp_replace(lower(coalesce(c.website,'')),'^https?://(www\\.)?([^/:?#]+).*$','\\2')=$1
       ORDER BY c.name LIMIT $2`, [domain, limit])).rows;
  }

  // ---------- Non-delivery reports ----------
  async uncheckedNdr(limit = 20, provider: "graph" | "imap" = "graph") {
    return (await this.q<MessageRow>(`SELECT m.* FROM crm_mail.messages m WHERE m.is_ndr AND NOT m.ndr_checked AND m.removed_at IS NULL AND m.provider=$2 ORDER BY m.id LIMIT $1`, [limit, provider])).rows;
  }
  async recentSentRecipients(days = 30) {
    const { rows } = await this.q<{ a: string }>(
      `SELECT DISTINCT jsonb_array_elements_text(to_addresses || cc_addresses) AS a FROM crm_mail.messages
       WHERE folder='sentitems' AND COALESCE(sent_at,received_at) > NOW()-($1||' days')::interval`, [String(days)]);
    return rows.map((r) => r.a);
  }
  // A delivery report. Only an address that does not exist (kind "address") is blocked for
  // future sends; a transport or policy block is shown but blocks nobody. When the report
  // quotes our Message-ID, the failure is put on that sent draft only.
  async recordNdr(messageId: number, failed: FailedRecipient[], isNdr: boolean, originalMessageId: string | null = null) {
    const finals = failed.filter((f) => f.kind !== "temporary");
    const kind = !failed.length ? null : failed.some((f) => f.kind === "address") ? "address" : (finals[0] ?? failed[0]).kind;
    const addressesList = [...new Set(failed.map((f) => f.address))];
    await this.q(`UPDATE crm_mail.messages SET ndr_checked=true, is_ndr=$2, ndr_recipients=$3, ndr_kind=$4 WHERE id=$1`, [messageId, isNdr, JSON.stringify(addressesList), isNdr ? kind : null]);
    if (!isNdr || !failed.length) return;
    for (const f of failed.filter((x) => x.kind === "address"))
      await this.q(`INSERT INTO crm_mail.suppressions(address,reason,ndr_message_id) VALUES($1,'ndr',$2)
        ON CONFLICT (address) DO UPDATE SET reason='ndr', ndr_message_id=EXCLUDED.ndr_message_id, created_at=NOW(), lifted_by=NULL, lifted_at=NULL`, [f.address, messageId]);
    if (finals.length) {
      const list = [...new Set(finals.map((f) => f.address))];
      const finalKind = finals.some((f) => f.kind === "address") ? "address" : finals[0].kind;
      const exact = originalMessageId
        ? await this.q(`UPDATE crm_mail.drafts SET delivery_failed_at=NOW(), delivery_failed_for=$2, delivery_failure_kind=$3
            WHERE internet_message_id=$1 AND state IN ('accepted','in_sent')`, [originalMessageId, JSON.stringify(list), finalKind])
        : { rowCount: 0 };
      if (!exact.rowCount)
        await this.q(`UPDATE crm_mail.drafts SET delivery_failed_at=NOW(), delivery_failed_for=$2, delivery_failure_kind=$3
          WHERE state IN ('accepted','in_sent') AND (to_addresses || cc_addresses) ?| $1::text[] AND COALESCE(accepted_at,in_sent_at) > NOW()-INTERVAL '30 days'`,
          [list, JSON.stringify(list), finalKind]);
    }
    // The report belongs to the prospect it is about (exact address match only).
    const { contacts, clientIds } = await this.matches(addressesList);
    const d = decideLink(contacts, clientIds);
    if (d.state === "linked") await this.setLink(messageId, d.clientId, d.contactId, "auto", null);
    else await this.q(`UPDATE crm_mail.messages SET link_state=$2 WHERE id=$1 AND link_state IN ('pending','unknown')`, [messageId, d.state]);
    await this.event("ndr", { channel: "sync", messageId, detail: { failed: failed.map((f) => ({ address: f.address, kind: f.kind, status: f.status ?? null })) } });
  }
  async suppressed(list: string[]) {
    if (!list.length) return new Set<string>();
    const { rows } = await this.q<{ address: string }>(`SELECT address FROM crm_mail.suppressions WHERE lifted_at IS NULL AND address = ANY($1::text[])`, [list]);
    return new Set(rows.map((r) => r.address));
  }
  async suppressions() {
    return (await this.q<{ address: string; reason: string; created_at: Date; ndr_message_id: number | null }>(
      `SELECT address,reason,created_at,ndr_message_id FROM crm_mail.suppressions WHERE lifted_at IS NULL ORDER BY created_at DESC LIMIT 200`)).rows;
  }
  async liftSuppression(address: string, adminId: number) {
    await this.q(`UPDATE crm_mail.suppressions SET lifted_by=$2, lifted_at=NOW() WHERE address=$1 AND lifted_at IS NULL`, [normalizeAddress(address), adminId]);
    await this.event("unsuppress", { adminId, detail: { address: normalizeAddress(address) } });
  }

  // ---------- Drafts ----------
  async insertDraft(d: { graphId: string; internetMessageId: string | null; conversationId: string | null; changeKey: string | null; kind: "new" | "reply"; replyTo: number | null; clientId: number | null; contactId: number | null; to: string[]; cc: string[]; subject: string; adminId: number; channel: string;
    provider?: "graph" | "imap"; inReplyTo?: string | null; references?: string[]; attachments?: AttachmentMeta[] }) {
    const { rows } = await this.q<{ id: number }>(
      `INSERT INTO crm_mail.drafts(graph_id,internet_message_id,conversation_id,change_key,kind,reply_to,client_id,contact_id,to_addresses,cc_addresses,subject,prepared_by,updated_by,provider,in_reply_to,references_ids,attachments)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13,$14,$15,$16) RETURNING id`,
      [d.graphId, d.internetMessageId, d.conversationId, d.changeKey, d.kind, d.replyTo, d.clientId, d.contactId, JSON.stringify(d.to), JSON.stringify(d.cc), d.subject.slice(0, 500), d.adminId,
        d.provider ?? "graph", d.inReplyTo ?? null, JSON.stringify(d.references ?? []), JSON.stringify(d.attachments ?? [])]);
    await this.event("prepare", { adminId: d.adminId, channel: d.channel, draftId: rows[0].id, detail: { kind: d.kind, to: d.to, cc: d.cc, attachments: (d.attachments ?? []).map((a) => a.name) } });
    return rows[0].id;
  }
  async draft(id: number) {
    return (await this.q<DraftRow>(`SELECT * FROM crm_mail.drafts WHERE id=$1`, [id])).rows[0] ?? null;
  }
  async draftsFor(where: { clientId?: number; contactId?: number; states?: string[] }, limit = 50) {
    const cond: string[] = [], values: unknown[] = [];
    if (where.contactId) { values.push(where.contactId); cond.push(`contact_id=$${values.length}`); }
    else if (where.clientId) { values.push(where.clientId); cond.push(`client_id=$${values.length}`); }
    if (where.states) { values.push(where.states); cond.push(`state = ANY($${values.length}::text[])`); }
    values.push(limit);
    return (await this.q<DraftRow>(`SELECT * FROM crm_mail.drafts ${cond.length ? "WHERE " + cond.join(" AND ") : ""} ORDER BY updated_at DESC LIMIT $${values.length}`, values)).rows;
  }
  async updateDraftMeta(id: number, d: { to: string[]; cc: string[]; subject: string; changeKey: string | null; internetMessageId?: string | null; adminId: number; channel: string; attachments?: AttachmentMeta[] }) {
    await this.q(`UPDATE crm_mail.drafts SET to_addresses=$2, cc_addresses=$3, subject=$4, change_key=$5, internet_message_id=COALESCE($7,internet_message_id), attachments=COALESCE($8,attachments), updated_by=$6, updated_at=NOW() WHERE id=$1 AND state='draft'`,
      [id, JSON.stringify(d.to), JSON.stringify(d.cc), d.subject.slice(0, 500), d.changeKey, d.adminId, d.internetMessageId ?? null, d.attachments ? JSON.stringify(d.attachments) : null]);
    await this.event("edit", { adminId: d.adminId, channel: d.channel, draftId: id, detail: { to: d.to, cc: d.cc, ...(d.attachments ? { attachments: d.attachments.map((a) => a.name) } : {}) } });
  }
  async submitDraft(id: number, adminId: number, channel: string) {
    const r = await this.q(`UPDATE crm_mail.drafts SET submitted_by=$2, submitted_at=NOW() WHERE id=$1 AND state='draft'`, [id, adminId]);
    if (r.rowCount) await this.event("submit", { adminId, channel, draftId: id });
    return r.rowCount > 0;
  }
  // Only one sender at a time, only from "draft": a second click cannot send twice.
  async claimSend(id: number, adminId: number, channel: string) {
    const claim = randomUUID();
    const { rows } = await this.q<DraftRow>(
      `UPDATE crm_mail.drafts SET state='sending', claim=$2, lease_until=NOW()+INTERVAL '2 minutes', send_requested_by=$3, send_requested_at=NOW(), failure_code=NULL
       WHERE id=$1 AND state='draft' RETURNING *`, [id, claim, adminId]);
    if (rows[0]) await this.event("send-request", { adminId, channel, draftId: id });
    return rows[0] ?? null;
  }
  async finishSend(id: number, claim: string, state: "accepted" | "failed" | "uncertain", code: string, adminId: number, channel: string, detail: Record<string, unknown> = {}) {
    await this.q(`UPDATE crm_mail.drafts SET state=$3, failure_code=$4, accepted_at=CASE WHEN $3='accepted' THEN NOW() ELSE accepted_at END, claim=NULL, lease_until=NULL
      WHERE id=$1 AND claim=$2 AND state='sending'`, [id, claim, state, code]);
    await this.event(`send-${state}`, { adminId, channel, draftId: id, detail: { code, ...detail } });
  }
  // Recipients refused by the SMTP server while others were accepted.
  async recordRejected(id: number, failed: FailedRecipient[]) {
    if (!failed.length) return;
    const kind = failed.some((f) => f.kind === "address") ? "address" : failed[0].kind;
    await this.q(`UPDATE crm_mail.drafts SET delivery_failed_at=NOW(), delivery_failed_for=$2, delivery_failure_kind=$3 WHERE id=$1`,
      [id, JSON.stringify(failed.map((f) => f.address)), kind]);
  }
  // Copy of a message accepted by SMTP in the Sent folder: saved by the CRM, found there
  // (already copied by the server or a previous attempt), or failed (accepted all the same).
  async setSentCopy(id: number, copy: "saved" | "found" | "failed", adminId: number | null, channel: string) {
    if (copy === "failed") {
      await this.q(`UPDATE crm_mail.drafts SET sent_copy='failed' WHERE id=$1 AND state='accepted'`, [id]);
      await this.event("sent-copy-failed", { adminId, channel, draftId: id });
      return;
    }
    const r = await this.q(`UPDATE crm_mail.drafts SET sent_copy=$2, state='in_sent', in_sent_at=COALESCE(in_sent_at,NOW()) WHERE id=$1 AND state IN ('accepted','uncertain','in_sent')`, [id, copy]);
    if (r.rowCount) await this.event(copy === "saved" ? "sent-copy-saved" : "in-sent", { adminId, channel, draftId: id });
  }
  // A "sending" row whose process died: uncertain, never resent automatically.
  expireSending() {
    return this.q(`UPDATE crm_mail.drafts SET state='uncertain', failure_code='interrupted', claim=NULL, lease_until=NULL WHERE state='sending' AND lease_until<NOW()`);
  }
  async markInSent(internetMessageId: string | null, graphId: string) {
    const { rows } = await this.q<{ id: number; client_id: number | null; contact_id: number | null }>(
      `UPDATE crm_mail.drafts SET state='in_sent', in_sent_at=COALESCE(in_sent_at,NOW()), sent_copy=CASE WHEN provider='imap' THEN COALESCE(sent_copy,'found') ELSE sent_copy END
       WHERE (graph_id=$2 OR ($1::text IS NOT NULL AND internet_message_id=$1)) AND state IN ('sending','accepted','uncertain','draft')
       RETURNING id, client_id, contact_id`, [internetMessageId, graphId]);
    for (const r of rows) await this.event("in-sent", { channel: "sync", draftId: r.id });
    return rows;
  }
  // The CRM draft a message in Sent comes from (already marked by the send itself).
  async sentDraftFor(internetMessageId: string | null) {
    if (!internetMessageId) return [];
    return (await this.q<{ id: number; client_id: number | null; contact_id: number | null }>(
      `SELECT id, client_id, contact_id FROM crm_mail.drafts WHERE internet_message_id=$1 AND state IN ('accepted','in_sent')`, [internetMessageId])).rows;
  }
  async setDraftState(id: number, from: string[], to: string, adminId: number | null, channel: string, action: string) {
    const r = await this.q(`UPDATE crm_mail.drafts SET state=$3, updated_at=NOW() WHERE id=$1 AND state = ANY($2::text[])`, [id, from, to]);
    if (r.rowCount) await this.event(action, { adminId, channel, draftId: id });
    return r.rowCount > 0;
  }
  async draftEvents(id: number) {
    return (await this.q<{ at: Date; action: string; channel: string; admin: string | null; detail: Record<string, unknown> }>(
      `SELECT e.at, e.action, e.channel, a.name AS admin, e.detail FROM crm_mail.events e LEFT JOIN admins a ON a.id=e.admin_id
       WHERE e.draft_id=$1 ORDER BY e.id`, [id])).rows;
  }
  // Certificate expiry alerts: one per credential, threshold and certificate.
  async certAlert(credential: string, threshold: number, notAfter: Date, state: string) {
    const r = await this.q(`INSERT INTO crm_mail.cert_alerts(credential,threshold,not_after,state) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [credential, threshold, notAfter, state]);
    return r.rowCount > 0;
  }
}
