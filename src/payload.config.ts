import { buildConfig } from "payload";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { fr } from "@payloadcms/translations/languages/fr";
import sharp from "sharp";
import {
  Admins,
  Clients,
  ClientAccounts,
  Tickets,
  Replies,
  Notes,
  Files,
  Pages,
  Media,
  Contacts,
  SocialLinks,
  Projects,
  CaseStudies,
  CRMContacts,
  CRMDeals,
  CRMActivities,
  CRMDocuments,
} from "@/collections";
import { requiredSecret, secret } from "@/lib/env";
import path from "node:path";
import { disabledEmail } from "@/lib/email";
export default buildConfig({
  secret:
    process.env.BUILD_MODE === "1"
      ? "build-only-not-for-runtime-not-a-secret"
      : requiredSecret("PAYLOAD_SECRET"),
  email: disabledEmail,
  admin: {
    user: "admins",
    importMap: { baseDir: path.resolve("src") },
    theme: "light",
    // Local icon: Gravatar would send a hash of the admin email to a third party.
    avatar: "default",
    dateFormat: "dd/MM/yyyy HH:mm",
    meta: {
      titleSuffix: " — 5/Sync IT administration",
      icons: [{ rel: "icon", type: "image/png", url: "/favicon-5.png" }],
    },
    components: {
      graphics: {
        Logo: "@/components/admin/Brand#Logo",
        Icon: "@/components/admin/Brand#Icon",
      },
      beforeDashboard: ["@/components/admin/Overview#Overview"],
    },
  },
  i18n: { supportedLanguages: { fr }, fallbackLanguage: "fr" },
  routes: { api: "/api/cms" },
  graphQL: { disable: true },
  editor: lexicalEditor(),
  sharp,
  db: postgresAdapter({
    pool: {
      connectionString:
        process.env.BUILD_MODE === "1"
          ? "postgres://unused@127.0.0.1:1/unused"
          : requiredSecret("DATABASE_URI"),
    },
    push: false,
    disableCreateDatabase: true,
    migrationDir: path.resolve("src/migrations"),
  }),
  // Admin navigation follows this order: inbox, CRM, support, site, settings.
  collections: [
    Contacts,
    CRMDeals,
    CRMDocuments,
    CRMContacts,
    CRMActivities,
    Tickets,
    Replies,
    Notes,
    Files,
    Clients,
    ClientAccounts,
    Pages,
    Projects,
    CaseStudies,
    Media,
    Admins,
  ],
  globals: [SocialLinks],
  typescript: { outputFile: path.resolve("src/payload-types.ts") },
  upload: { limits: { fileSize: 5 * 1024 * 1024 } },
  csrf: [process.env.APP_ORIGIN, process.env.ADMIN_ORIGIN].filter(
    (x): x is string => !!x,
  ),
  cors: [],
});
