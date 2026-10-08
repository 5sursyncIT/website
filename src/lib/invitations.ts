import { createHash, randomBytes } from "node:crypto";
import { database } from "./database";
export const invitationHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function newInvitation() {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    hash: invitationHash(token),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  };
}
// Atomic consume: a token can be redeemed once even under concurrent requests.
// Password update failure leaves the account disabled; the team reissues an invite.
export async function consumeInvitation(token: string) {
  const { rows } = await database().query(
    "UPDATE client_accounts SET invitation_hash=NULL, invitation_expires_at=NULL WHERE invitation_hash=$1 AND invitation_expires_at>NOW() AND enabled=false RETURNING id",
    [invitationHash(token)],
  );
  return rows[0]?.id as number | undefined;
}
