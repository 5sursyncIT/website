# Disposable check of the English pages: throwaway database seeded with the shipped copy.
import json, os, re
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = "/out"
PAGES = {
    "/": "/en", "/services": "/en/services", "/reseaux-cloud": "/en/networks-cloud",
    "/solutions-metier": "/en/business-solutions", "/developpement-api": "/en/development-api",
    "/maintenance-support": "/en/maintenance-support", "/realisations": "/en/projects",
    "/a-propos": "/en/about", "/contact": "/en/contact", "/mentions-legales": "/en/legal-notice",
    "/politique-de-confidentialite": "/en/privacy-policy",
}
# Words that only appear in French running text; proper names and the French legal
# references deliberately kept on the English legal pages are removed first.
FRENCH = re.compile(r"\b(votre|vos|nous|des|les|pour|avec|une|Parlons|Découvrir|Réalisations|propos|Accueil|Entreprise)\b")
KEPT = ["Commission de protection des données personnelles", "mentions légales",
        "politique de confidentialité", "Résidence El'hadji Oumar Dieng", "Résidence El’hadji Oumar Dieng"]
results = []

def check(name, ok, detail=""):
    results.append({"check": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))

def visible_text(page):
    return page.locator("body").inner_text()

with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []
    for width in (1440, 390):
        page = browser.new_page(viewport={"width": width, "height": 900})
        page.on("pageerror", lambda e: errors.append(str(e)))
        for fr, en in PAGES.items():
            r = page.goto(BASE + en)
            page.wait_for_load_state("networkidle")
            check(f"{en} {width}px 200", r.status == 200, str(r.status))
            if width == 1440:
                check(f"{en} html lang en", page.get_attribute("html", "lang") == "en")
                text = visible_text(page)
                for kept in KEPT: text = text.replace(kept, "")
                left = sorted(set(FRENCH.findall(text)))
                check(f"{en} no French running text", not left, ", ".join(left))
                alt = page.locator("link[rel=alternate][hreflang=fr]").get_attribute("href") or ""
                check(f"{en} hreflang fr", alt.rstrip("/") == "https://preprod.5sursync.com" + fr.rstrip("/"), alt)
                canon = page.locator("link[rel=canonical]").get_attribute("href") or ""
                check(f"{en} canonical", canon.endswith(en), canon)
                internal = [h for h in page.eval_on_selector_all("a[href^='/']:not([hreflang=fr])", "els => els.map(e => e.getAttribute('href'))")]
                french_links = [h for h in internal if not (h.startswith("/en") or h.startswith("/support") or h.startswith("/assets/"))]
                check(f"{en} internal links stay in English", not french_links, ", ".join(french_links))
            overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
            check(f"{en} {width}px no horizontal overflow", overflow <= 0, str(overflow))
            if en in ("/en", "/en/about", "/en/contact", "/en/projects"):
                name = en.strip("/").replace("/", "-")
                page.screenshot(path=f"{OUT}/{name}-{width}.png", full_page=True)
        if width == 390:
            page.goto(BASE + "/en")
            page.locator("button.menu-toggle").click()
            page.screenshot(path=f"{OUT}/en-menu-390.png")
            check("mobile menu shows FR switch", page.locator("a.nav-language").is_visible())
        page.close()

    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.on("pageerror", lambda e: errors.append(str(e)))
    # French pages: still French, with an EN switch to the same page; text saved for comparison.
    os.makedirs(f"{OUT}/fr-text", exist_ok=True); os.chmod(f"{OUT}/fr-text", 0o777)
    for fr, en in PAGES.items():
        r = page.goto(BASE + fr)
        page.wait_for_load_state("networkidle")
        check(f"{fr} 200 lang fr", r.status == 200 and page.get_attribute("html", "lang") == "fr")
        switch = page.locator("a.nav-language")
        check(f"{fr} EN switch", switch.count() == 1 and switch.get_attribute("href") == en, switch.get_attribute("href") if switch.count() else "absent")
        name = fr.strip("/").replace("/", "-") or "accueil"
        open(f"{OUT}/fr-text/{name}.txt", "w").write(visible_text(page))
    page.goto(BASE + "/a-propos")
    page.locator("a.nav-language").click()
    page.wait_for_url("**/en/about")
    check("switch FR→EN lands on /en/about", page.get_attribute("html", "lang") == "en")
    page.locator("a.nav-language").click()
    page.wait_for_url("**/a-propos")
    check("switch EN→FR lands on /a-propos", page.get_attribute("html", "lang") == "fr")

    r = page.goto(BASE + "/does-not-exist")
    check("unknown French page 404 (reference)", r.status == 404, str(r.status))
    r = page.goto(BASE + "/en/does-not-exist")
    check("unknown /en page 404 in English", r.status == 404 and "Page not found" in page.content(), str(r.status))

    page.goto(BASE + "/en/contact")
    page.fill("input[name=name]", "Partner Fixture")
    page.fill("input[name=email]", "partner@example.test")
    page.select_option("select[name=topic]", "developpement-api")
    page.fill("textarea[name=message]", "English test message from the disposable check.")
    page.locator("button[type=submit]").click()
    status = page.locator("p.form-status")
    status.wait_for(state="visible", timeout=15000)
    check("English contact form: recorded, English message", status.inner_text() == "Your request has been recorded.", status.inner_text())
    check("topic labels in English", "Development and APIs" in page.locator("select[name=topic]").inner_text())

    r = page.goto(BASE + "/admin/login")
    page.wait_for_load_state("networkidle")
    check("admin login page renders", r.status == 200 and page.locator("input[name=email]").count() == 1, str(r.status))
    errors[:] = [e for e in errors if "admin" not in e]
    check("no browser errors", not errors, "; ".join(errors[:3]))
    browser.close()

json.dump(results, open(f"{OUT}/results.json", "w"), indent=1, ensure_ascii=False)
failed = [r for r in results if not r["ok"]]
print(f"{len(results) - len(failed)}/{len(results)} passed")
raise SystemExit(1 if failed else 0)
