import type { EmailAdapter } from "payload";
import { randomUUID } from "node:crypto";
import { contactSMTPTransport } from "./contact-smtp";
// Prevent Payload's development fallback from logging reset tokens or email bodies.
export const disabledEmail: EmailAdapter = () => ({
  name: "disabled-until-approved",
  defaultFromAddress: "no-reply@example.invalid",
  defaultFromName: "5/Sync IT",
  sendEmail: async () => {
    throw new Error("Email transport is not configured");
  },
});
// Readable plain-text fallback: block tags become line breaks, the rest is dropped and
// entities are restored, so the link stays usable in a text-only client.
export const textFromHTML = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>|<head[\s\S]*?<\/head>/gi, "")
    .replace(/<\/(p|h1|h2|h3|tr|div)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
// Production transport, used only by the administrators' password reset. It reuses the
// approved no-reply@5sursync.com sender (contactSMTPTransport refuses to start on any
// other configuration), so preproduction and the test benches never send anything.
//
// The transport is created per message rather than kept open: resets are rare, and a
// pooled connection would outlive the request. Nothing about the message is logged —
// the body carries a single-use token, which is exactly what the disabled adapter above
// was put in place to keep out of the logs.
const productionEmail: EmailAdapter = () => ({
  name: "no-reply-smtp",
  defaultFromAddress: "no-reply@5sursync.com",
  defaultFromName: "5/Sync IT",
  sendEmail: async (message) => {
    const transport = contactSMTPTransport();
    try {
      const to = Array.isArray(message.to) ? message.to.join(", ") : String(message.to ?? "");
      const html = String(message.html ?? "");
      return await transport.sendMail({
        from: "5/Sync IT <no-reply@5sursync.com>",
        to,
        subject: String(message.subject ?? ""),
        // A message with no plain-text part is far more likely to be filed as spam,
        // and this one has to arrive: it is the only way back into a locked account.
        text: String(message.text ?? "") || textFromHTML(html),
        html,
        // Own Message-ID on the sending domain, as the contact notifications do:
        // a missing or foreign one costs deliverability.
        messageId: `<${randomUUID()}@5sursync.com>`,
      });
    } finally {
      transport.close();
    }
  },
});
// Approved production SMTP only; anywhere else Payload keeps the disabled adapter and a
// password reset simply cannot be requested.
export const emailAdapter = (): EmailAdapter =>
  process.env.SMTP_ENABLED === "true" &&
  process.env.SMTP_USER === "no-reply@5sursync.com" &&
  process.env.APP_ORIGIN === "https://5sursync.com"
    ? productionEmail
    : disabledEmail;
