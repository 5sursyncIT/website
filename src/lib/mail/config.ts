import { X509Certificate, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
// Configuration of the CRM mailbox link. Everything is off unless the production instance
// sets MAIL_ENABLED=true with its credentials; preproduction has none of it (and its own
// database since 8 October: documentation/microsoft365.md, section 7).
// One provider only, chosen by MAIL_PROVIDER: "graph" (Microsoft 365 contact@5sursync.com,
// default, kept for rollback) or "imap" (Simafri contact@crm.5sursync.com through SMTP and
// IMAP, documentation/messagerie-simafri.md). The other one is never built, so the same
// message can never leave through both.
export const OFFICIAL_GRAPH = "https://graph.microsoft.com/v1.0";
export const OFFICIAL_LOGIN = "https://login.microsoftonline.com";
const PRODUCTION = "https://5sursync.com";

export type Credential = { name: "read" | "send"; clientId: string; keyPem: string; thumbprint: string; notAfter: Date };
export type MailConfig = {
  tenantId: string;
  mailboxId: string;
  mailboxAddress: string;
  graphBase: string;
  loginBase: string;
  sinceDays: number;
  // Undefined: sending closed. "*": open. Otherwise only these recipients (acceptance tests).
  sendAllowlist: string[] | "*" | undefined;
  read: Credential;
  send: Credential;
};

const env = (name: string) => (process.env[name] ?? "").trim();
function credential(name: "read" | "send", prefix: string): Credential {
  const clientId = env(`${prefix}_CLIENT_ID`);
  const keyPem = readFileSync(env(`${prefix}_KEY_FILE`), "utf8");
  const cert = new X509Certificate(readFileSync(env(`${prefix}_CERT_FILE`)));
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) throw new Error(`${prefix}_CLIENT_ID invalide`);
  // Entra identifies the certificate by its SHA-1 thumbprint (x5t header).
  const thumbprint = createHash("sha1").update(cert.raw).digest("base64url");
  return { name, clientId, keyPem, thumbprint, notAfter: new Date(cert.validTo) };
}

export function parseAllowlist(value: string): string[] | "*" | undefined {
  const v = value.trim();
  if (!v) return undefined;
  if (v === "*") return "*";
  return v.split(/[,;\s]+/).map((a) => a.toLowerCase()).filter(Boolean);
}

// Reasons are short codes for the status page; values are never shown.
export type MailStatus =
  | { enabled: true; provider: "graph"; config: MailConfig }
  | { enabled: true; provider: "imap"; config: ImapConfig }
  | { enabled: false; reason: string };
export function mailStatus(): MailStatus {
  if (process.env.BUILD_MODE === "1") return { enabled: false, reason: "build" };
  if (env("MAIL_ENABLED") !== "true") return { enabled: false, reason: "disabled" };
  const provider = env("MAIL_PROVIDER") || "graph";
  if (provider === "imap") return imapStatus();
  if (provider !== "graph") return { enabled: false, reason: "configuration" };
  const graphBase = env("MAIL_GRAPH_BASE") || OFFICIAL_GRAPH;
  const loginBase = env("MAIL_LOGIN_BASE") || OFFICIAL_LOGIN;
  const origin = env("APP_ORIGIN");
  const official = graphBase === OFFICIAL_GRAPH && loginBase === OFFICIAL_LOGIN;
  // Real Microsoft endpoints only from the production origin; a test double (fake Graph
  // on an internal network) only from a non-production origin.
  if (official ? origin !== PRODUCTION : origin === PRODUCTION) return { enabled: false, reason: "origin" };
  try {
    const sinceDays = Number(env("MAIL_SYNC_SINCE_DAYS") || 90);
    const config: MailConfig = {
      tenantId: env("MAIL_TENANT_ID"),
      mailboxId: env("MAIL_MAILBOX_ID"),
      mailboxAddress: env("MAIL_MAILBOX_ADDRESS").toLowerCase(),
      graphBase,
      loginBase,
      sinceDays: Number.isInteger(sinceDays) && sinceDays > 0 && sinceDays <= 365 ? sinceDays : 90,
      sendAllowlist: parseAllowlist(env("MAIL_SEND_ALLOWLIST")),
      read: credential("read", "MAIL_READ"),
      send: credential("send", "MAIL_SEND"),
    };
    if (!/^[0-9a-f-]{36}$/i.test(config.tenantId) || !/^[0-9a-f-]{36}$/i.test(config.mailboxId) || !config.mailboxAddress.includes("@"))
      return { enabled: false, reason: "configuration" };
    return { enabled: true, provider: "graph", config };
  } catch {
    return { enabled: false, reason: "configuration" };
  }
}

// ---------- Simafri: SMTP + IMAP, contact@crm.5sursync.com ----------
// Verified on 9 October 2026: SMTP mail.crm.5sursync.com:587 with STARTTLS; IMAP on
// da-uk2.hostns.io:993 with implicit TLS (mail.crm.5sursync.com presents a certificate for
// another name on IMAP). Certificates are always verified against the system authorities
// and the host name; MAIL_TLS_CA_FILE (a test authority) is refused in production.
export const SIMAFRI = {
  address: "contact@crm.5sursync.com",
  // EHLO name: the reverse DNS name of the VPS (185.187.169.152). The Simafri server refuses
  // a name of its own domains ("550 Bad HELO - Host impersonating domain name", 09/10).
  ehlo: "vmi3557177.contaboserver.net",
  smtp: { host: "mail.crm.5sursync.com", port: 587 },
  imap: { host: "da-uk2.hostns.io", port: 993 },
} as const;
export type ImapConfig = {
  mailboxAddress: string;
  displayName: string;
  user: string;
  // Read from the secret file at each connection; never kept in a field that could be
  // serialised, logged or rendered.
  password: () => string;
  smtp: { host: string; port: number };
  imap: { host: string; port: number };
  ehloName: string;
  ca?: string;
  official: boolean;
  sinceDays: number;
  sendAllowlist: string[] | "*" | undefined;
  // Only for a server without SPECIAL-USE attributes: explicit folder paths.
  draftsPath?: string;
  sentPath?: string;
};
const port = (value: string, fallback: number) => {
  const n = Number(value || fallback);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : NaN;
};
function imapStatus(): MailStatus {
  const origin = env("APP_ORIGIN");
  const smtp = { host: (env("MAIL_SMTP_HOST") || SIMAFRI.smtp.host).toLowerCase(), port: port(env("MAIL_SMTP_PORT"), SIMAFRI.smtp.port) };
  const imap = { host: (env("MAIL_IMAP_HOST") || SIMAFRI.imap.host).toLowerCase(), port: port(env("MAIL_IMAP_PORT"), SIMAFRI.imap.port) };
  const official = smtp.host === SIMAFRI.smtp.host || imap.host === SIMAFRI.imap.host;
  // Real Simafri servers only from the production origin, test servers only elsewhere.
  if (official ? origin !== PRODUCTION : origin === PRODUCTION) return { enabled: false, reason: "origin" };
  try {
    const mailboxAddress = (env("MAIL_ADDRESS") || SIMAFRI.address).toLowerCase();
    const user = env("MAIL_USER") || mailboxAddress;
    if (official && (smtp.host !== SIMAFRI.smtp.host || smtp.port !== SIMAFRI.smtp.port || imap.host !== SIMAFRI.imap.host
      || imap.port !== SIMAFRI.imap.port || mailboxAddress !== SIMAFRI.address || user !== SIMAFRI.address || env("MAIL_TLS_CA_FILE")))
      return { enabled: false, reason: "configuration" };
    const passwordFile = env("MAIL_PASSWORD_FILE");
    if (!passwordFile || !readFileSync(passwordFile, "utf8").trim()) return { enabled: false, reason: "configuration" };
    const sinceDays = Number(env("MAIL_SYNC_SINCE_DAYS") || 90);
    const config: ImapConfig = {
      mailboxAddress, user,
      displayName: env("MAIL_DISPLAY_NAME") || "L’équipe 5/Sync IT",
      password: () => readFileSync(passwordFile, "utf8").trim(),
      smtp, imap, official,
      ehloName: official ? SIMAFRI.ehlo : env("MAIL_EHLO_NAME") || "localhost",
      ca: env("MAIL_TLS_CA_FILE") ? readFileSync(env("MAIL_TLS_CA_FILE"), "utf8") : undefined,
      sinceDays: Number.isInteger(sinceDays) && sinceDays > 0 && sinceDays <= 365 ? sinceDays : 90,
      sendAllowlist: parseAllowlist(env("MAIL_SEND_ALLOWLIST")),
      draftsPath: env("MAIL_IMAP_DRAFTS_PATH") || undefined,
      sentPath: env("MAIL_IMAP_SENT_PATH") || undefined,
    };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailboxAddress) || Number.isNaN(smtp.port) || Number.isNaN(imap.port))
      return { enabled: false, reason: "configuration" };
    return { enabled: true, provider: "imap", config };
  } catch {
    return { enabled: false, reason: "configuration" };
  }
}
