// Pure rules of the CRM ↔ contact@ link: no I/O, unit tested (tests/mail.test.ts).

export const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;
export const normalizeAddress = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : "");

// ---------- Recipients ----------
export function parseRecipients(input: unknown): { addresses: string[]; invalid: string[] } {
  const parts = String(input ?? "").split(/[,;\s]+/).map(normalizeAddress).filter(Boolean);
  const addresses = [...new Set(parts.filter((a) => EMAIL.test(a)))];
  return { addresses, invalid: parts.filter((a) => !EMAIL.test(a)) };
}
// Why a send must be refused before calling Microsoft (null = allowed).
export function sendRefusal(recipients: string[], allowlist: string[] | "*" | undefined, suppressed: Set<string>, mailbox: string): string | null {
  if (!recipients.length) return "Aucun destinataire.";
  if (allowlist === undefined) return "L’envoi n’est pas encore ouvert (recette en cours).";
  const rejected = recipients.filter((r) => suppressed.has(r));
  if (rejected.length) return `Adresse rejetée par un rapport de non-remise : ${rejected.join(", ")}. Corrigez-la ou levez le blocage.`;
  if (allowlist !== "*") {
    const outside = recipients.filter((r) => !allowlist.includes(r));
    if (outside.length) return `Destinataire hors de la liste de recette : ${outside.join(", ")}.`;
  }
  if (recipients.includes(mailbox)) return "La boîte contact@ ne peut pas s’écrire à elle-même.";
  return null;
}

// ---------- Linking a message to a company / contact ----------
export type Counterparts = { folder: "inbox" | "sentitems"; from?: string | null; to: string[]; cc: string[] };
export function counterpartAddresses(m: Counterparts, mailbox: string) {
  const list = m.folder === "inbox" ? [m.from ?? ""] : [...m.to, ...m.cc];
  return [...new Set(list.map(normalizeAddress).filter((a) => a && a !== mailbox))];
}
export type ContactMatch = { id: number; clientId: number };
export type LinkDecision =
  | { state: "linked"; clientId: number; contactId: number | null }
  | { state: "ambiguous"; clientIds: number[] }
  | { state: "unknown" };
// Automatic only when the exact address(es) designate a single contact and nothing else:
// no other contact (duplicates included) and no other company's general address. A company
// address alone, duplicates or several possible records → manual attribution, with the
// matching companies offered as candidates. Never guessed from a domain.
export function decideLink(contacts: ContactMatch[], clientIds: number[]): LinkDecision {
  const byContact = [...new Map(contacts.map((c) => [c.id, c])).values()];
  const candidates = [...new Set([...byContact.map((c) => c.clientId), ...clientIds])];
  if (byContact.length === 1 && candidates.length === 1)
    return { state: "linked", clientId: byContact[0].clientId, contactId: byContact[0].id };
  return candidates.length ? { state: "ambiguous", clientIds: candidates } : { state: "unknown" };
}
// Domains shared by many unrelated people: never a hint for a company.
const PUBLIC_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.fr", "hotmail.com", "hotmail.fr", "outlook.com", "outlook.fr",
  "live.com", "live.fr", "msn.com", "icloud.com", "me.com", "aol.com", "orange.sn", "orange.fr", "free.fr", "laposte.net",
  "gmx.com", "gmx.fr", "proton.me", "protonmail.com", "yandex.com", "mail.com", "sfr.fr", "wanadoo.fr",
]);
export function companyDomain(address: string): string | null {
  const domain = normalizeAddress(address).split("@")[1] ?? "";
  return domain && !PUBLIC_DOMAINS.has(domain) ? domain : null;
}
export const websiteDomain = (site: unknown) =>
  typeof site === "string" ? site.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#:]/)[0] : "";

// ---------- Non-delivery reports ----------
export function isLikelyNdr(from: string | null | undefined, subject: string | null | undefined) {
  return (
    /^(postmaster|mailer-daemon|microsoftexchange[0-9a-f]*)@/i.test(normalizeAddress(from)) ||
    /^\s*(undeliverable|undelivered|non remis|non distribu|échec de (la )?remise|delivery status notification \(failure\)|mail delivery failed|returned mail)/i.test(subject ?? "")
  );
}
// Message class (PR_MESSAGE_CLASS, String 0x001A) of an Exchange NDR.
export const isNdrClass = (value: unknown) => typeof value === "string" && /^REPORT\.IPM\.Note\.(NDR|DR)?/i.test(value) && /NDR/i.test(value);
// Failed recipients = addresses quoted in the report that we really wrote to.
export function ndrFailedRecipients(reportText: string, sentTo: Iterable<string>) {
  const found = new Set((reportText.match(/[^\s@<>()"',;:[\]]+@[^\s@<>()"',;:[\]]+\.[a-z]{2,}/gi) ?? []).map(normalizeAddress));
  return [...new Set([...sentTo].map(normalizeAddress))].filter((a) => found.has(a));
}

// ---------- Body, signature (added once) ----------
export const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const unescapeHtml = (html: string) =>
  html.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
export const LOGO_CID = "sync5-logo";
export const SIGNATURE_MARK = "sync5-signature";
export const COMPOSE_MARK = "sync5-compose";
// Validated 8 October 2026: slogan, horizontal logo on the right, WhatsApp, shared-box identity.
export function signatureHtml() {
  const t = 'style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;color:#092234;vertical-align:top;padding:0 18px 0 0"';
  return (
    `<table id="${SIGNATURE_MARK}" class="${SIGNATURE_MARK}" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;border-top:2px solid #2ee9d8;padding-top:10px">` +
    `<tr><td ${t}><strong>L’équipe 5/Sync IT</strong><br>` +
    `<span style="color:#007a77">Des solutions informatiques pour faire avancer votre entreprise.</span><br>` +
    `Almadie 2, Résidence El’hadji Oumar Dieng, 4ème A, Dakar, Sénégal<br>` +
    `Tél. +221 33 805 79 09 · +221 77 097 29 08 · WhatsApp +221 76 881 30 39<br>` +
    `<a href="mailto:contact@5sursync.com" style="color:#007a77">contact@5sursync.com</a> · ` +
    `<a href="https://5sursync.com" style="color:#007a77">5sursync.com</a></td>` +
    `<td style="vertical-align:middle"><img src="cid:${LOGO_CID}" alt="5/Sync IT" width="170" style="display:block;width:170px;height:auto"></td></tr></table>`
  );
}
const composeBlock = (text: string) =>
  `<div class="${COMPOSE_MARK}" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111">` +
  (escapeHtml(text.replace(/\r\n?/g, "\n").trim()).replace(/\n/g, "<br>") || "<br>") + `</div>`;
export const hasSignature = (html: string) => html.includes(SIGNATURE_MARK);
// The CRM always rebuilds the whole body: our text, the signature exactly once, then (for
// a reply) the quoted original. Nothing has to be found again in HTML rewritten by Exchange.
export function composeBody(text: string, quote = "") {
  return `<html><body>${composeBlock(text)}${signatureHtml()}${quote}</body></html>`;
}
export function quoteHtml(original: { fromName?: string | null; fromAddress?: string | null; date?: Date | string | null; html: string }) {
  const when = original.date
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Dakar" }).format(new Date(original.date))
    : "";
  const who = escapeHtml([original.fromName, original.fromAddress ? `<${original.fromAddress}>` : ""].filter(Boolean).join(" "));
  const inner = stripActiveHtml(original.html.replace(/^[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, ""));
  return `<div class="sync5-quote" style="margin-top:18px"><p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#4a6482">Le ${escapeHtml(when)}, ${who} a écrit :</p>` +
    `<blockquote style="margin:0 0 0 8px;padding-left:10px;border-left:3px solid #d5e0ea">${inner}</blockquote></div>`;
}
// Our text from the draft as plain text (Exchange's own conversion): everything above the
// first line of the signature.
export const SIGNATURE_FIRST_LINE = "L’équipe 5/Sync IT";
export function composeFromText(text: string): string | null {
  const i = text.indexOf(SIGNATURE_FIRST_LINE);
  return i < 0 ? null : text.slice(0, i).replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

// ---------- States ----------
export const draftStates: Record<string, { label: string; tone: string; hint: string }> = {
  draft: { label: "Brouillon", tone: "info", hint: "Enregistré dans les Brouillons de contact@. Rien n’est parti." },
  sending: { label: "Envoi en cours", tone: "wait", hint: "Demande transmise à Microsoft, réponse attendue." },
  accepted: { label: "Accepté par Microsoft", tone: "wait", hint: "Microsoft a pris l’envoi en charge (réponse 202). Ce n’est pas une preuve de réception." },
  in_sent: { label: "Présent dans les Éléments envoyés", tone: "ok", hint: "Le message figure dans les Éléments envoyés de contact@. Ce n’est pas une preuve de réception." },
  failed: { label: "Refusé par Microsoft", tone: "off", hint: "Microsoft a refusé la demande d’envoi : rien n’est parti." },
  uncertain: { label: "Résultat incertain", tone: "wait", hint: "Délai dépassé ou erreur réseau : vérifier l’état avant toute nouvelle tentative." },
  discarded: { label: "Abandonné", tone: "off", hint: "Brouillon abandonné." },
};
export const draftStateLabel = (state: string) => draftStates[state]?.label ?? state;

// ---------- HTML view of a received message (defence in depth with sandbox + CSP) ----------
export function stripActiveHtml(html: string) {
  return html
    .replace(/<(script|style|iframe|frame|frameset|object|embed|applet|form|base|link|meta|svg|math|template|noscript)\b[\s\S]*?(<\/\1\s*>|$)/gi, (m, tag) =>
      tag.toLowerCase() === "style" ? m.replace(/@import[^;]+;?/gi, "").replace(/url\s*\([^)]*\)/gi, "none") : "")
    .replace(/<(meta|base|link|input|button|object|embed)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src|action|formaction|background|poster|srcset)\s*=\s*("\s*(javascript|vbscript|data):[^"]*"|'\s*(javascript|vbscript|data):[^']*'|(javascript|vbscript|data):[^\s>]*)/gi, "")
    .replace(/url\s*\(\s*(['"]?)\s*(javascript|vbscript|https?:)[^)]*\)/gi, "none");
}
