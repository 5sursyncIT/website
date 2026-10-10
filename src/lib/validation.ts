import { z } from "zod";
import { serviceValues } from "@/lib/contact-topics";
export const categories = [
  "reseaux-cloud",
  "solutions-metier",
  "developpement-api",
  "maintenance-support",
  "autre",
] as const;
export const contactSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    company: z.string().trim().max(150).default(""),
    email: z.email().max(150),
    phone: z.string().trim().max(40).default(""),
    topic: z.enum(categories),
    message: z.string().trim().min(10).max(3000),
    // Service page the visitor came from, when there is one. Bounded to the known
    // slugs: never free text from the browser.
    service: z.preprocess((v) => v || "", z.enum(["", ...serviceValues] as [string, ...string[]])).default(""),
    website: z.string().max(0).default(""),
  })
  .strict();
export const ticketSchema = z
  .object({
    subject: z.string().trim().min(3).max(180),
    category: z.enum(categories),
    description: z.string().trim().min(10).max(10000),
  })
  .strict();
export const replySchema = z
  .object({ message: z.string().trim().min(1).max(10000) })
  .strict();
export const loginSchema = z
  .object({ email: z.email().max(150), password: z.string().min(1).max(200) })
  .strict();
export function validateFile(bytes: Uint8Array, mime: string, name: string) {
  if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024)
    throw new Error("File size");
  const ext = name.split(".").pop()?.toLowerCase();
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = Buffer.from(bytes.subarray(0, 8)).equals(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  const pdf = Buffer.from(bytes.subarray(0, 5)).toString() === "%PDF-";
  if (
    !(
      (mime === "image/jpeg" && ["jpg", "jpeg"].includes(ext || "") && jpeg) ||
      (mime === "image/png" && ext === "png" && png) ||
      (mime === "application/pdf" && ext === "pdf" && pdf)
    )
  )
    throw new Error("File type");
  if (/[\/\\\x00-\x1f]/.test(name) || name.length > 150)
    throw new Error("File name");
  return { mime, bytes: bytes.length, name };
}
