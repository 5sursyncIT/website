import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { LOGO_CID, normalizeAddress } from "./rules";
// MIME messages of the SMTP/IMAP link (Simafri): built with nodemailer's composer, read with
// mailparser. Loaded at runtime (like contact-smtp.ts) so that Next does not bundle them.
// No file or URL is ever read by the composer (disableFileAccess / disableUrlAccess).
const load = createRequire(import.meta.url);

type ParsedAddress = { value: { address?: string; name?: string; group?: unknown[] }[]; text: string };
export type ParsedAttachment = {
  filename?: string; contentType: string; contentDisposition?: string; cid?: string; related?: boolean;
  size: number; content: Buffer; checksum: string;
};
export type ParsedMail = {
  subject?: string; from?: ParsedAddress; to?: ParsedAddress | ParsedAddress[]; cc?: ParsedAddress | ParsedAddress[];
  bcc?: ParsedAddress | ParsedAddress[]; replyTo?: ParsedAddress; date?: Date; messageId?: string; inReplyTo?: string;
  references?: string | string[]; html: string | false; text?: string; attachments: ParsedAttachment[];
  headers: Map<string, unknown>;
};

export function parseMail(source: Buffer): Promise<ParsedMail> {
  const { simpleParser } = load("mailparser") as { simpleParser(s: Buffer, o: Record<string, unknown>): Promise<ParsedMail> };
  return simpleParser(source, { skipImageLinks: true, skipTextLinks: true, skipTextToHtml: true, maxHtmlLengthToParse: 2_000_000 });
}
export const addressList = (value?: ParsedAddress | ParsedAddress[]) =>
  (Array.isArray(value) ? value : value ? [value] : []).flatMap((a) => a.value).map((v) => normalizeAddress(v.address)).filter(Boolean);
export const firstAddress = (value?: ParsedAddress) => ({ address: normalizeAddress(value?.value[0]?.address) || null, name: value?.value[0]?.name?.slice(0, 200) || null });
// The Sender header (mailparser keeps it as an address object in headers).
export const senderAddress = (mail: ParsedMail) => addressList(mail.headers.get("sender") as ParsedAddress | undefined)[0] ?? null;
export const referenceList = (value?: string | string[]) => (Array.isArray(value) ? value : value ? value.split(/\s+/) : []).filter((r) => /^<[^<>\s]+>$/.test(r));
// Attachments a person would see: not the inline images of the HTML (logo, embedded pictures).
export const visibleAttachments = (mail: ParsedMail) =>
  mail.attachments
    .map((a, index) => ({ a, index }))
    .filter(({ a }) => !(a.related || (a.cid && a.contentDisposition !== "attachment")) && !/^(message\/delivery-status|text\/rfc822-headers)$/i.test(a.contentType));
export const attachmentId = (index: number, a: ParsedAttachment) => `${index}-${a.checksum.slice(0, 16)}`;

// ---------- Outgoing ----------
export type OutgoingAttachment = { filename: string; contentType: string; content: Buffer };
export type Outgoing = {
  from: { name: string; address: string }; to: string[]; cc: string[]; subject: string; text: string; html: string;
  messageId: string; inReplyTo?: string | null; references?: string[]; attachments: OutgoingAttachment[]; logo: Buffer; date?: Date;
};
export function buildMime(o: Outgoing): Promise<Buffer> {
  const MailComposer = load("nodemailer/lib/mail-composer") as new (mail: Record<string, unknown>) => { compile(): { build(cb: (e: Error | null, b: Buffer) => void): void } };
  const composer = new MailComposer({
    from: o.from, replyTo: o.from, to: o.to, cc: o.cc.length ? o.cc : undefined, subject: o.subject,
    text: o.text, html: o.html, messageId: o.messageId, date: o.date ?? new Date(),
    inReplyTo: o.inReplyTo ?? undefined, references: o.references?.length ? o.references.join(" ") : undefined,
    attachments: [
      ...o.attachments.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType, contentDisposition: "attachment" })),
      // The logo of the signature, exactly once, referenced by cid from the HTML.
      { filename: "5sync-it.jpg", content: o.logo, contentType: "image/jpeg", cid: LOGO_CID, contentDisposition: "inline" },
    ],
    disableFileAccess: true, disableUrlAccess: true,
  });
  return new Promise((resolve, reject) => composer.compile().build((e, b) => (e ? reject(e) : resolve(b))));
}
// The Date header is set again at sending time (a draft may wait for days).
export function withDate(raw: Buffer, date: Date) {
  const text = raw.toString("latin1");
  const end = text.indexOf("\r\n\r\n");
  if (end < 0) return raw;
  const stamp = date.toUTCString().replace(/GMT$/, "+0000");
  const head = /^Date:/im.test(text.slice(0, end))
    ? text.slice(0, end).replace(/^Date:.*(\r\n[ \t].*)*$/im, `Date: ${stamp}`)
    : `Date: ${stamp}\r\n${text.slice(0, end)}`;
  return Buffer.from(head + text.slice(end), "latin1");
}
export const sha16 = (raw: Buffer) => createHash("sha256").update(raw).digest("hex").slice(0, 16);

// Outgoing attachments chosen in the CRM: a few documents, no executable or active content.
export const ATTACHMENT_LIMITS = { count: 5, total: 4 * 1024 * 1024 };
const BLOCKED = /\.(exe|com|bat|cmd|scr|pif|msi|msp|js|jse|vbs|vbe|wsf|wsh|ps1|psm1|hta|cpl|jar|lnk|reg|dll|iso|img|vhd|html?|svg|xhtml|mht|url|appx|scf)$/i;
export function attachmentRefusal(files: { name: string; size: number }[]): string | null {
  if (files.length > ATTACHMENT_LIMITS.count) return `${ATTACHMENT_LIMITS.count} pièces jointes au plus.`;
  if (files.reduce((n, f) => n + f.size, 0) > ATTACHMENT_LIMITS.total) return "Pièces jointes : 4 Mo au total au plus.";
  const bad = files.filter((f) => BLOCKED.test(f.name) || !f.name.trim());
  if (bad.length) return `Type de fichier refusé : ${bad.map((f) => f.name || "(sans nom)").join(", ")}.`;
  return null;
}
export const safeFilename = (name: string) => name.replace(/[\r\n\0"\\/]/g, "_").replace(/^\.+/, "_").slice(0, 150) || "piece-jointe";
