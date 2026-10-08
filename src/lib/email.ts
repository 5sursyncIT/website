import type { EmailAdapter } from "payload";
// Prevent Payload's development fallback from logging reset tokens or email bodies.
export const disabledEmail: EmailAdapter = () => ({
  name: "disabled-until-approved",
  defaultFromAddress: "no-reply@example.invalid",
  defaultFromName: "5/Sync IT",
  sendEmail: async () => {
    throw new Error("Email transport is not configured");
  },
});
