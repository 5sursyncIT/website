import { unstable_cache } from "next/cache";
export const socialPlatforms = [
  { label: "Facebook", value: "facebook" },
  { label: "Instagram", value: "instagram" },
  { label: "LinkedIn", value: "linkedin" },
  { label: "X (Twitter)", value: "x" },
  { label: "YouTube", value: "youtube" },
  { label: "TikTok", value: "tiktok" },
  { label: "WhatsApp", value: "whatsapp" },
];
export type SocialLink = { platform: string; url: string };
// Admin-entered links end up in every page: only plain https URLs are accepted.
export function isSocialURL(value: unknown) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}
export async function socialLinks(): Promise<SocialLink[]> {
  if (process.env.BUILD_MODE === "1") return [];
  try {
    return await unstable_cache(
      async () => {
        const { getPayload } = await import("payload");
        const { default: config } = await import("@payload-config");
        const payload = await getPayload({ config });
        const global = await payload.findGlobal({
          slug: "social-links",
          depth: 0,
          overrideAccess: false,
        });
        return (global.links || [])
          .filter((link) => isSocialURL(link.url))
          .map(({ platform, url }) => ({ platform, url }));
      },
      ["social-links"],
      { revalidate: 300, tags: ["social"] },
    )();
  } catch {
    // The footer must never take a page down.
    return [];
  }
}
