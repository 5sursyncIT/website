import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
// E-mailing a quote, invoice or credit note as a PDF attachment. One click = one
// message; the ledger keeps what SMTP really answered and nothing is resent.
export type DocumentMail = {
  to: string; from: string; replyTo?: string; bcc?: string; subject: string; text: string; messageId: string;
  attachments: { filename: string; content: Buffer; contentType: string }[];
};
export type SendDocumentMail = (mail: DocumentMail) => Promise<{ accepted: string[] }>;
export type MailState = "accepted" | "failed" | "uncertain";
export async function sendDocumentMail(
  pool: Pool,
  input: { documentID: number; to: string; subject: string; text: string; pdf: Uint8Array; filename: string; replyTo?: string; sentBy: number },
  send: SendDocumentMail,
): Promise<MailState> {
  const messageId = `<crm-document-${input.documentID}-${randomUUID()}@5sursync.com>`;
  const { rows } = await pool.query(
    `INSERT INTO app_crm_document_mails(document_id,recipient,subject,sent_by,message_id,state) VALUES($1,$2,$3,$4,$5,'dispatching') RETURNING id`,
    [input.documentID, input.to, input.subject, input.sentBy, messageId],
  );
  let state: MailState, code: string;
  try {
    const result = await send({
      to: input.to, from: "no-reply@5sursync.com", replyTo: input.replyTo, bcc: input.replyTo,
      subject: input.subject, text: input.text, messageId,
      attachments: [{ filename: input.filename, content: Buffer.from(input.pdf), contentType: "application/pdf" }],
    });
    state = result.accepted.map((x) => x.toLowerCase()).includes(input.to.toLowerCase()) ? "accepted" : "failed";
    code = state === "accepted" ? "smtp-accepted" : "recipient-not-accepted";
  } catch {
    state = "uncertain";
    code = "transport-error";
  }
  await pool.query(`UPDATE app_crm_document_mails SET state=$2,error_code=$3,updated_at=NOW() WHERE id=$1 AND state='dispatching'`, [rows[0].id, state, code]);
  return state;
}
// History for the document page. A send interrupted mid-way (still "dispatching"
// after 5 minutes) is shown as uncertain: it may or may not have left.
export async function documentMails(pool: Pool, documentID: number) {
  const { rows } = await pool.query(
    `SELECT m.recipient,m.subject,m.created_at,a.name AS sender,
       CASE WHEN m.state='dispatching' AND m.updated_at<NOW()-INTERVAL '5 minutes' THEN 'uncertain' ELSE m.state END AS state
     FROM app_crm_document_mails m LEFT JOIN admins a ON a.id=m.sent_by WHERE m.document_id=$1 ORDER BY m.id DESC LIMIT 20`,
    [documentID],
  );
  return rows as { recipient: string; subject: string; created_at: Date; sender: string | null; state: string }[];
}
