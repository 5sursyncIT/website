import { siteOrigin, indexable } from "@/lib/site-meta";
import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { OrganizationJsonLd } from "@/components/OrganizationJsonLd";
import { openGraphBase, twitterBase } from "@/lib/page-meta";
import "../(site)/globals.css";
// English pages for partners: own root layout so the document is served as lang="en".
export const metadata: Metadata = {
  title: { default: "5/Sync IT", template: "%s | 5/Sync IT" },
  description:
    "Networks and cloud, business solutions, development and APIs, maintenance and support in Dakar, Senegal.",
  metadataBase: new URL(siteOrigin),
  robots: { index: indexable, follow: indexable },
  openGraph: { ...openGraphBase, locale: "en_GB" },
  twitter: twitterBase,
  icons: {
    icon: [{ url: '/favicon-5.png?v=20261007', type: 'image/png' }],
    shortcut: '/favicon-5.png?v=20261007',
    apple: '/favicon-5.png?v=20261007',
  },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#contenu">
          Skip to content
        </a>
        <Header />
        {children}
        <Footer locale="en" />
        <OrganizationJsonLd />
      </body>
    </html>
  );
}
