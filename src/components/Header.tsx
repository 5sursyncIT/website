"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { localeOf, localePath, switchPath } from "@/lib/locale";
const nav = {
  fr: [["/services", "Services"], ["/realisations", "Réalisations"], ["/a-propos", "À propos"], ["/support", "Support"], ["/contact", "Contact"]],
  en: [["/services", "Services"], ["/realisations", "Projects"], ["/a-propos", "About"], ["/support", "Support"], ["/contact", "Contact"]],
};
export function Header() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const locale = localeOf(path);
  const en = locale === "en";
  useEffect(() => {
    setOpen(false);
  }, [path]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, []);
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href={localePath(locale, "/")} className="brand" aria-label={en ? "5/Sync IT — Home" : "5/Sync IT — Accueil"}>
          <img
            src="/assets/logo-horizontal.jpeg"
            width="1012"
            height="249"
            alt="5/Sync IT"
          />
        </Link>
        <button
          className="menu-toggle"
          aria-controls="navigation"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          Menu
        </button>
        <nav
          id="navigation"
          className={open ? "is-open" : ""}
          aria-label={en ? "Main navigation" : "Navigation principale"}
        >
          {nav[locale].map(([page, label]) => {
            const href = localePath(locale, page);
            return (
              <Link
                key={href}
                href={href}
                aria-current={path === href ? "page" : undefined}
                className={page === "/contact" ? "nav-contact" : ""}
              >
                {label}
              </Link>
            );
          })}
          {/* Each language has its own root layout (html lang), so this is a full page load. */}
          <a
            className="nav-language"
            href={switchPath(path)}
            hrefLang={en ? "fr" : "en"}
            lang={en ? "fr" : "en"}
            aria-label={en ? "Français (FR)" : "English (EN)"}
          >
            {en ? "FR" : "EN"}
          </a>
        </nav>
      </div>
    </header>
  );
}
