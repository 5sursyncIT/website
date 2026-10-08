"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function Header() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
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
        <Link href="/" className="brand" aria-label="5/Sync IT — Accueil">
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
          aria-label="Navigation principale"
        >
          {[
            ["/services", "Services"],
            ["/realisations", "Réalisations"],
            ["/a-propos", "À propos"],
            ["/support", "Support"],
            ["/contact", "Contact"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={path === href ? "page" : undefined}
              className={href === "/contact" ? "nav-contact" : ""}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
