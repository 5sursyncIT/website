import { createRequire } from "node:module";
import type { ImapFlow, ImapFlowOptions } from "imapflow";
import type { ImapConfig } from "./config";
// Connections to the Simafri mailbox contact@crm.5sursync.com: IMAP (implicit TLS) to read,
// keep drafts and the Sent copy; SMTP (STARTTLS required) to send. Certificates are always
// verified (system authorities, host name); the password is read from its secret file at
// each connection and never logged: no client logger, no transaction log.
const load = createRequire(import.meta.url);

// Short, value-free error codes for the CRM pages and logs.
export class MailServerError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
// Certificate and handshake failures only. A server refusal that merely mentions STARTTLS
// (e.g. a refused EHLO) is not a TLS failure.
const TLS_CODES = /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME|ERR_SSL|DEPTH_ZERO|EPROTO|^ETLS$/i;
const TLS_TEXT = /certificate|self[- ]signed|altnames|unable to verify|handshake failure|wrong version number/i;
export const isTlsError = (e: unknown) => {
  const err = e as { code?: string; message?: string; cause?: { code?: string; message?: string } } | null;
  return !!err && (TLS_CODES.test(err.code ?? "") || TLS_CODES.test(err.cause?.code ?? "") || TLS_TEXT.test(err.message ?? "") || TLS_TEXT.test(err.cause?.message ?? ""));
};
function imapError(e: unknown): MailServerError {
  if (e instanceof MailServerError) return e;
  const err = e as { authenticationFailed?: boolean; code?: string } | null;
  if (err?.authenticationFailed) return new MailServerError("imap-auth");
  if (isTlsError(e)) return new MailServerError("imap-tls");
  return new MailServerError("imap-unavailable");
}

export type Folders = { inbox: string; drafts: string; sent: string; uidplus: boolean };

export class ImapMailbox {
  constructor(readonly config: ImapConfig) {}

  private options(): ImapFlowOptions {
    const { host, port } = this.config.imap;
    return {
      host, port, secure: true, servername: host,
      auth: { user: this.config.user, pass: this.config.password() },
      tls: { rejectUnauthorized: true, servername: host, minVersion: "TLSv1.2", ...(this.config.ca ? { ca: this.config.ca } : {}) },
      logger: false, emitLogs: false, logRaw: false, disableAutoIdle: true,
      clientInfo: { name: "5sursync-crm" },
      connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 60_000,
    };
  }

  // Folders by their SPECIAL-USE attributes (RFC 6154) as announced by the server, never
  // guessed from their names. Explicit paths only when configured for a server without them.
  async folders(client: ImapFlow): Promise<Folders> {
    const list = await client.list();
    const byUse = (use: string) => list.find((f) => f.specialUse === use && f.specialUseSource === "extension")?.path;
    const drafts = this.config.draftsPath ?? byUse("\\Drafts");
    const sent = this.config.sentPath ?? byUse("\\Sent");
    if (!drafts || !sent) throw new MailServerError("folder-not-identified");
    for (const path of [drafts, sent]) if (!list.some((f) => f.path === path)) throw new MailServerError("folder-not-found");
    return { inbox: "INBOX", drafts, sent, uidplus: client.capabilities.has("UIDPLUS") };
  }

  // One connection per operation (low volume), always closed.
  async session<T>(work: (client: ImapFlow, folders: Folders) => Promise<T>): Promise<T> {
    const { ImapFlow: Client } = load("imapflow") as { ImapFlow: new (o: ImapFlowOptions) => ImapFlow };
    const client = new Client(this.options());
    client.on("error", () => undefined);
    try {
      await client.connect();
    } catch (e) {
      client.close();
      throw imapError(e);
    }
    try {
      return await work(client, await this.folders(client));
    } catch (e) {
      if (e instanceof MailServerError) throw e;
      // Our own refusals and database errors pass through unchanged.
      if ((e as { code?: string; responseStatus?: string } | null)?.responseStatus || isTlsError(e) || (e as { code?: string })?.code === "NoConnection")
        throw imapError(e);
      throw e;
    } finally {
      await client.logout().catch(() => client.close());
    }
  }

  // SMTP submission, step by step so that the outcome is exact: a failure while
  // connecting (STARTTLS, certificate) or authenticating proves nothing was transmitted.
  async smtpSession<T>(work: (send: (envelope: { from: string; to: string[] }, raw: Buffer) => Promise<SmtpInfo>) => Promise<T>, onPhaseError: (phase: "connect" | "auth", e: unknown) => T): Promise<T> {
    const { host, port } = this.config.smtp;
    const SMTPConnection = load("nodemailer/lib/smtp-connection") as new (o: unknown) => SmtpConnection;
    const conn = new SMTPConnection({
      host, port, secure: false, requireTLS: true, name: this.config.ehloName,
      tls: { rejectUnauthorized: true, servername: host, minVersion: "TLSv1.2", ...(this.config.ca ? { ca: this.config.ca } : {}) },
      logger: false, debug: false, transactionLog: false,
      connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 60_000,
    });
    let failure: ((e: unknown) => void) | null = null;
    conn.on("error", (e) => failure?.(e));
    conn.on("end", () => failure?.(Object.assign(new Error("closed"), { code: "ECONNECTION" })));
    const step = <V>(run: (done: (e?: unknown, v?: V) => void) => void) =>
      new Promise<V>((resolve, reject) => {
        let settled = false;
        failure = (e) => { if (!settled) { settled = true; reject(e); } };
        run((e, v) => { if (settled) return; settled = true; if (e) reject(e); else resolve(v as V); });
      });
    let phase: "connect" | "auth" = "connect";
    try {
      await step<void>((done) => conn.connect(() => done()));
      phase = "auth";
      await step<void>((done) => conn.login({ user: this.config.user, pass: this.config.password() }, (e) => done(e)));
    } catch (e) {
      failure = null;
      conn.close();
      return onPhaseError(phase, e);
    }
    try {
      return await work((envelope, raw) => step<SmtpInfo>((done) => conn.send(envelope, raw, (e, info) => done(e, info))));
    } finally {
      failure = null;
      try { conn.quit(); } catch { conn.close(); }
    }
  }
}
type SmtpConnection = {
  on(event: "error" | "end", listener: (e?: unknown) => void): void;
  connect(cb: () => void): void;
  login(auth: { user: string; pass: string }, cb: (e?: unknown) => void): void;
  send(envelope: { from: string; to: string[] }, message: Buffer, cb: (e: unknown, info: SmtpInfo) => void): void;
  quit(): void;
  close(): void;
};
export type SmtpInfo = { accepted: string[]; rejected: string[]; rejectedErrors?: { recipient?: string; responseCode?: number; response?: string }[]; response?: string };

// Before the message: TLS, DNS, connection or authentication failure; nothing was sent.
export function smtpPhaseCode(phase: "connect" | "auth", e: unknown) {
  const err = (e ?? {}) as { code?: string; responseCode?: number; message?: string };
  // A reply from the server (sometimes only quoted in the message): a refusal, not TLS.
  const replied = err.responseCode ?? Number(err.message?.match(/response=([45]\d\d)\b/)?.[1] ?? 0);
  if (phase === "connect" && replied && err.code !== "ETLS") return `smtp-connect-${replied}`;
  if (isTlsError(e)) return "smtp-tls";
  if (phase === "auth") return err.responseCode ? `smtp-auth-${err.responseCode}` : "smtp-auth";
  return err.responseCode ? `smtp-connect-${err.responseCode}` : "smtp-unreachable";
}
// While sending (authenticated session): a reply from the server, whatever its code,
// proves the message was not accepted. No reply (timeout, cut connection) proves nothing:
// "uncertain", never retried automatically.
export function smtpSendOutcome(e: unknown): { state: "failed" | "uncertain"; code: string } {
  const err = (e ?? {}) as { code?: string; responseCode?: number; command?: string };
  if (err.responseCode) return { state: "failed", code: `smtp-${err.responseCode}${err.command ? `-${err.command.split(" ")[0].toLowerCase()}` : ""}` };
  if (err.code === "EENVELOPE" || err.code === "EMESSAGE" && err.command === "API") return { state: "failed", code: `smtp-${err.code.toLowerCase()}` };
  return { state: "uncertain", code: `smtp-${(err.code ?? "error").toLowerCase()}` };
}
