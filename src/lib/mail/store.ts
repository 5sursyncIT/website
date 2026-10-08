import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { counterpartAddresses, decideLink, normalizeAddress, type LinkDecision } from "./rules";
// PostgreSQL side of the mailbox link (schema crm_mail, production database only).
// Identifiers and metadata only: never a body, a preview or an attachment.

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
};
export type DraftRow = {
  id: number; graph_id: string; internet_message_id: string | null; conversation_id: string | null; kind: "new" | "reply";
  reply_to: number | null; client_id: number | null; contact_id: number | null; to_addresses: string[]; cc_addresses: string[];
  subject: string; change_key: string | null; state: string; prepared_by: number | null; prepared_at: Date; updated_by: number | null; updated_at: Date;
  submitted_by: number | null; submitted_at: Date | null; send_requested_by: number | null; send_requested_at: Date | null;
  claim: string | null; lease_until: Date | null; accepted_at: Date | null; in_sent_at: Date | null; failure_code: string | null;
  delivery_failed_at: Date | null; delivery_failed_for: string[];
};
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
  finishFolder(folder: Folder, error: string | null, seen: number) {
    return error
      ? this.q(`UPDATE crm_mail.sync_state SET lease_until=NULL,last_error=$2,last_error_at=NOW(),messages_seen=messages_seen+$3 WHERE folder=$1`, [folder, error.slice(0, 200), seen])
      : this.q(`UPDATE crm_mail.sync_state SET lease_until=NULL,last_success_at=NOW(),last_error=NULL,messages_seen=messages_seen+$2 WHERE folder=$1`, [folder, seen]);
  }
  async syncStates() {
    return (await this.q<{ folder: string; initial_since: Date; last_run_at: Date | null; last_success_at: Date | null; last_error: string | null; last_error_at: Date | null; messages_seen: string; complete: boolean }>(
      `SELECT folder,initial_since,last_run_at,last_success_at,last_error,last_error_at,messages_seen,delta_link IS NOT NULL AND next_link IS NULL AS complete FROM crm_mail.sync_state ORDER BY folder`)).rows;
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
  async uncheckedNdr(limit = 20) {
    return (await this.q<MessageRow>(`SELECT m.* FROM crm_mail.messages m WHERE m.is_ndr AND NOT m.ndr_checked AND m.removed_at IS NULL ORDER BY m.id LIMIT $1`, [limit])).rows;
  }
  async recentSentRecipients(days = 30) {
    const { rows } = await this.q<{ a: string }>(
      `SELECT DISTINCT jsonb_array_elements_text(to_addresses || cc_addresses) AS a FROM crm_mail.messages
       WHERE folder='sentitems' AND COALESCE(sent_at,received_at) > NOW()-($1||' days')::interval`, [String(days)]);
    return rows.map((r) => r.a);
  }
  async recordNdr(messageId: number, failed: string[], isNdr: boolean) {
    await this.q(`UPDATE crm_mail.messages SET ndr_checked=true, is_ndr=$2, ndr_recipients=$3 WHERE id=$1`, [messageId, isNdr, JSON.stringify(failed)]);
    if (!isNdr || !failed.length) return;
    for (const address of failed)
      await this.q(`INSERT INTO crm_mail.suppressions(address,reason,ndr_message_id) VALUES($1,'ndr',$2)
        ON CONFLICT (address) DO UPDATE SET reason='ndr', ndr_message_id=EXCLUDED.ndr_message_id, created_at=NOW(), lifted_by=NULL, lifted_at=NULL`, [address, messageId]);
    await this.q(`UPDATE crm_mail.drafts SET delivery_failed_at=NOW(), delivery_failed_for=$2
      WHERE state IN ('accepted','in_sent') AND (to_addresses || cc_addresses) ?| $1::text[] AND COALESCE(accepted_at,in_sent_at) > NOW()-INTERVAL '30 days'`,
      [failed, JSON.stringify(failed)]);
    // The report belongs to the prospect it is about (exact address match only).
    const { contacts, clientIds } = await this.matches(failed);
    const d = decideLink(contacts, clientIds);
    if (d.state === "linked") await this.setLink(messageId, d.clientId, d.contactId, "auto", null);
    else await this.q(`UPDATE crm_mail.messages SET link_state=$2 WHERE id=$1 AND link_state IN ('pending','unknown')`, [messageId, d.state]);
    await this.event("ndr", { channel: "sync", messageId, detail: { failed } });
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
  async insertDraft(d: { graphId: string; internetMessageId: string | null; conversationId: string | null; changeKey: string | null; kind: "new" | "reply"; replyTo: number | null; clientId: number | null; contactId: number | null; to: string[]; cc: string[]; subject: string; adminId: number; channel: string }) {
    const { rows } = await this.q<{ id: number }>(
      `INSERT INTO crm_mail.drafts(graph_id,internet_message_id,conversation_id,change_key,kind,reply_to,client_id,contact_id,to_addresses,cc_addresses,subject,prepared_by,updated_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING id`,
      [d.graphId, d.internetMessageId, d.conversationId, d.changeKey, d.kind, d.replyTo, d.clientId, d.contactId, JSON.stringify(d.to), JSON.stringify(d.cc), d.subject.slice(0, 500), d.adminId]);
    await this.event("prepare", { adminId: d.adminId, channel: d.channel, draftId: rows[0].id, detail: { kind: d.kind, to: d.to, cc: d.cc } });
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
  async updateDraftMeta(id: number, d: { to: string[]; cc: string[]; subject: string; changeKey: string | null; internetMessageId?: string | null; adminId: number; channel: string }) {
    await this.q(`UPDATE crm_mail.drafts SET to_addresses=$2, cc_addresses=$3, subject=$4, change_key=$5, internet_message_id=COALESCE($7,internet_message_id), updated_by=$6, updated_at=NOW() WHERE id=$1 AND state='draft'`,
      [id, JSON.stringify(d.to), JSON.stringify(d.cc), d.subject.slice(0, 500), d.changeKey, d.adminId, d.internetMessageId ?? null]);
    await this.event("edit", { adminId: d.adminId, channel: d.channel, draftId: id, detail: { to: d.to, cc: d.cc } });
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
  async finishSend(id: number, claim: string, state: "accepted" | "failed" | "uncertain", code: string, adminId: number, channel: string) {
    await this.q(`UPDATE crm_mail.drafts SET state=$3, failure_code=$4, accepted_at=CASE WHEN $3='accepted' THEN NOW() ELSE accepted_at END, claim=NULL, lease_until=NULL
      WHERE id=$1 AND claim=$2 AND state='sending'`, [id, claim, state, code]);
    await this.event(`send-${state}`, { adminId, channel, draftId: id, detail: { code } });
  }
  // A "sending" row whose process died: uncertain, never resent automatically.
  expireSending() {
    return this.q(`UPDATE crm_mail.drafts SET state='uncertain', failure_code='interrupted', claim=NULL, lease_until=NULL WHERE state='sending' AND lease_until<NOW()`);
  }
  async markInSent(internetMessageId: string | null, graphId: string) {
    const { rows } = await this.q<{ id: number; client_id: number | null; contact_id: number | null }>(
      `UPDATE crm_mail.drafts SET state='in_sent', in_sent_at=COALESCE(in_sent_at,NOW())
       WHERE (graph_id=$2 OR ($1::text IS NOT NULL AND internet_message_id=$1)) AND state IN ('sending','accepted','uncertain','draft')
       RETURNING id, client_id, contact_id`, [internetMessageId, graphId]);
    for (const r of rows) await this.event("in-sent", { channel: "sync", draftId: r.id });
    return rows;
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
