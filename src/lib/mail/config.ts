import { X509Certificate, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
// Configuration of the contact@ mailbox link. Everything is off unless the production
// instance sets MAIL_ENABLED=true with its certificates; preproduction has none of it
// (and its own database since 8 October: documentation/microsoft365.md, section 7).
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
export function mailStatus(): { enabled: true; config: MailConfig } | { enabled: false; reason: string } {
  if (process.env.BUILD_MODE === "1") return { enabled: false, reason: "build" };
  if (env("MAIL_ENABLED") !== "true") return { enabled: false, reason: "disabled" };
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
    return { enabled: true, config };
  } catch {
    return { enabled: false, reason: "configuration" };
  }
}
