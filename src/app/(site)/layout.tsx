import { siteOrigin, indexable } from "@/lib/site-meta";
import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { OrganizationJsonLd } from "@/components/OrganizationJsonLd";
import { openGraphBase, twitterBase } from "@/lib/page-meta";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "5/Sync IT", template: "%s | 5/Sync IT" },
  description:
    "Réseaux et cloud, solutions métier, développement et API, maintenance et support à Dakar.",
  metadataBase: new URL(siteOrigin),
  robots: { index: indexable, follow: indexable },
  openGraph: openGraphBase,
  twitter: twitterBase,
  icons: {
    icon: [{ url: '/favicon-5.png?v=20261007', type: 'image/png' }],
    shortcut: '/favicon-5.png?v=20261007',
    apple: '/favicon-5.png?v=20261007',
  },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <a className="skip-link" href="#contenu">
          Aller au contenu
        </a>
        <Header />
        {children}
        <Footer />
        <OrganizationJsonLd />
      </body>
    </html>
  );
}
