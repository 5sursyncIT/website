# Disposable admin UX check: fixture accounts only, local throwaway database.
import json, sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
EMAIL, PASSWORD = "admin@example.test", "fixture-password-123456"
OUT = "/out"
results = []

def check(name, ok, detail=""):
    results.append({"check": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))

with sync_playwright() as p:
    api = p.request.new_context(base_url=BASE)
    r = api.post("/api/cms/admins/first-register",
                 data={"email": EMAIL, "password": PASSWORD, "name": "Admin Fixture"})
    check("first-register fixture admin", r.status in (200, 201), str(r.status))
    for i, (topic, phone) in enumerate([("reseaux-cloud", "778544646"), ("solutions-metier", "")]):
        r = api.post("/api/contact", headers={"Origin": BASE},
                     data={"name": f"Visiteur Test {i+1}", "company": "Société Fixture",
                           "email": f"visiteur{i+1}@example.test", "phone": phone,
                           "topic": topic, "message": "Message de test\nsur deux lignes.",
                           "website": ""})
        check(f"contact fixture {i+1} recorded", r.status == 201, f"{r.status} {r.text()[:120]}")

    browser = p.chromium.launch()
    errors = []
    page = browser.new_page(viewport={"width": 1440, "height": 900}, locale="fr-FR")
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE + "/admin/login")
    page.wait_for_load_state("networkidle")
    page.screenshot(path=f"{OUT}/admin-login.png")
    check("login page in French", "Se connecter" in page.content() or "Connexion" in page.content())
    check("brand logo on login", page.locator("img.sync-admin-logo").count() == 1)
    check("reset-password link hidden (no mail transport)", not page.locator("a[href$='/admin/forgot']").first.is_visible() if page.locator("a[href$='/admin/forgot']").count() else True)
    page.fill("input[name=email]", EMAIL)
    page.fill("input[name=password]", PASSWORD)
    page.locator("button[type=submit]").click()
    page.wait_for_url("**/admin", timeout=30000)
    page.wait_for_load_state("networkidle")
    page.screenshot(path=f"{OUT}/admin-dashboard.png", full_page=True)
    check("no external avatar", page.locator("img[src*='gravatar']").count() == 0)
    toggle = page.locator(".nav-toggler, button[aria-label*='menu' i]").first
    if toggle.count():
        toggle.click(); page.wait_for_timeout(600)
        page.screenshot(path=f"{OUT}/admin-dashboard-nav.png")
    html = page.content()
    check("dashboard overview rendered", page.locator(".sync-overview").count() == 1)
    check("overview counts 2 recent contacts", page.locator(".sync-stat strong").first.inner_text() == "2")
    for g in ["Demandes", "Support client", "Site web", "Administration"]:
        check(f"nav group {g}", g in html)
    check("no English 'Contact Requests' label", "Contact Requests" not in html)

    page.goto(BASE + "/admin/collections/contact-requests")
    page.wait_for_load_state("networkidle")
    page.screenshot(path=f"{OUT}/admin-contacts-list.png")
    body = page.content()
    check("list shows topic label", "Réseaux et cloud" in body)
    check("list hides raw topic slug", "reseaux-cloud" not in page.locator("table").inner_text())

    page.locator("table a").first.click()
    page.wait_for_url("**/contact-requests/*")
    page.wait_for_selector(".sync-contact-actions")
    page.wait_for_load_state("networkidle")
    page.screenshot(path=f"{OUT}/admin-contact-detail.png", full_page=True)
    check("no API tab", page.get_by_role("link", name="API").count() == 0)
    msg = page.locator("textarea").first
    check("message read-only", msg.is_disabled() or msg.get_attribute("readonly") is not None)
    mail = page.locator(".sync-contact-actions a[href^='mailto:']")
    check("reply by email button", mail.count() == 1, mail.get_attribute("href") if mail.count() else "")
    check("topic label field", page.locator("input[value='Solutions métier'], input[value='Réseaux et cloud']").count() == 1)

    page.goto(BASE + "/admin/collections/pages")
    page.wait_for_load_state("networkidle")
    page.locator("table a").first.click()
    page.wait_for_url("**/pages/*")
    page.wait_for_selector(".sync-copy-label", timeout=30000)
    page.wait_for_load_state("networkidle")
    page.screenshot(path=f"{OUT}/admin-page-edit.png")
    check("page text rows labelled by key", page.locator(".sync-copy-label").count() > 0)

    # Ticket conversation, through the logged-in browser session (fixture data only)
    req = page.context.request
    client = req.post(BASE + "/api/cms/clients", headers={"Origin": BASE}, data={"name": "Client Fixture"}).json()["doc"]
    ticket = req.post(BASE + "/api/cms/tickets", headers={"Origin": BASE}, data={
        "client": client["id"], "subject": "Imprimante réseau en panne",
        "category": "maintenance-support", "description": "Fixture ticket."}).json()["doc"]
    page.goto(f"{BASE}/admin/collections/tickets/{ticket['id']}")
    page.wait_for_selector(".sync-thread")
    page.wait_for_selector(".sync-thread__empty:has-text('Aucun échange')")
    page.fill(".sync-thread__compose textarea", "Bonjour, nous intervenons demain matin.")
    page.click(".sync-thread__compose button")
    page.wait_for_selector(".sync-thread__item--reply")
    page.locator(".sync-thread__tabs label").nth(1).click()
    page.fill(".sync-thread__compose textarea", "Prévoir le câble de rechange.")
    page.click(".sync-thread__compose button")
    page.wait_for_selector(".sync-thread__item--note")
    page.screenshot(path=f"{OUT}/admin-ticket-thread.png", full_page=True)
    check("ticket thread shows reply then note",
          page.locator(".sync-thread__item").count() == 2
          and "intervenons" in page.locator(".sync-thread__item--reply").inner_text()
          and "Note interne" in page.locator(".sync-thread__item--note").inner_text())
    stored = req.get(f"{BASE}/api/cms/ticket-replies?where[ticket][equals]={ticket['id']}&depth=1", headers={"Origin": BASE}).json()
    check("reply stored with forced client and admin author",
          stored["totalDocs"] == 1 and stored["docs"][0]["client"]["id"] == client["id"]
          and stored["docs"][0]["author"]["relationTo"] == "admins")

    # Client company page: users, invitation, tickets (fixture data only)
    page.goto(f"{BASE}/admin/collections/clients/{client['id']}")
    page.wait_for_selector(".sync-client")
    page.wait_for_selector(".sync-panel__empty:has-text('Aucun utilisateur')")
    check("client page lists its ticket", "Imprimante réseau en panne" in page.locator(".sync-client").inner_text())
    page.fill(".sync-client__fields input[name=name]", "Utilisateur Fixture")
    page.fill(".sync-client__fields input[name=email]", "utilisateur@example.test")
    page.click(".sync-client__fields button")
    page.wait_for_selector(".sync-client__link textarea, .sync-client__invite .sync-thread__error")
    if page.locator(".sync-client__invite .sync-thread__error").count():
        page.screenshot(path=f"{OUT}/admin-client-error.png", full_page=True)
        print("INVITE ERROR:", page.locator(".sync-client__invite .sync-thread__error").inner_text())
    link1 = page.locator(".sync-client__link textarea").input_value()
    check("invitation link shown", "/support/activation#" in link1)
    page.wait_for_selector(".sync-badge--wait")
    check("account listed as pending invitation", "Invitation en attente" in page.locator(".sync-client").inner_text())
    page.screenshot(path=f"{OUT}/admin-client.png", full_page=True)
    page.click(".sync-client__row button:has-text('Nouveau lien')")
    page.wait_for_function("(a) => { const t = document.querySelector('.sync-client__link textarea'); return t && t.value && t.value !== a }", arg=link1)
    link2 = page.locator(".sync-client__link textarea").input_value()
    check("reissued link differs", link2 != link1 and "/support/activation#" in link2)

    mobile = browser.new_page(viewport={"width": 390, "height": 844}, locale="fr-FR")
    mobile.context.add_cookies(page.context.cookies())
    mobile.goto(BASE + "/admin")
    mobile.wait_for_load_state("networkidle")
    mobile.screenshot(path=f"{OUT}/admin-dashboard-mobile.png", full_page=True)
    overflow = mobile.evaluate("document.documentElement.scrollWidth > window.innerWidth")
    check("mobile dashboard without horizontal overflow", not overflow)
    check("no page JS errors", not errors, "; ".join(errors)[:300])
    browser.close()

json.dump(results, open(f"{OUT}/admin-ux-results.json", "w"), ensure_ascii=False, indent=2)
sys.exit(0 if all(r["ok"] for r in results) else 1)
