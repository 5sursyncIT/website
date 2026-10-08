import type { Metadata } from "next";
import "./crm.css";
// Separate root layout: the CRM is a back-office tool, without the public header/footer.
export const metadata: Metadata = {
  title: { default: "CRM", template: "%s — CRM 5/Sync IT" },
  robots: { index: false, follow: false },
  icons: { icon: [{ url: "/favicon-5.png?v=20261007", type: "image/png" }] },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="crm-body">{children}</body>
    </html>
  );
}
