# Disposable CRM check: fixture accounts only, throwaway *_test database (tests/crm-run.sh).
import json, re
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
EMAIL, PASSWORD = "admin@example.test", "fixture-password-123456"
OUT = "/out"
results = []

def check(name, ok, detail=""):
    results.append({"check": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))

def submit(page, button):
    # Server actions answer the form POST with the redirected page (RSC); the URL may
    # stay the same, so wait for that POST response, then for the page to settle.
    with page.expect_response(lambda r: r.request.method == "POST" and "/crm" in r.url, timeout=30000):
        button.click()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(300)

def flash(page):
    el = page.locator(".crm-flash")
    return el.first.inner_text() if el.count() else ""

with sync_playwright() as p:
    anon = p.request.new_context(base_url=BASE)
    r = anon.get("/crm", max_redirects=0)
    check("anonymous /crm redirected to admin login", r.status in (302, 303, 307) and "/admin/login" in r.headers.get("location", ""), f"{r.status} {r.headers.get('location')}")
    r = anon.get("/crm/export/clients", max_redirects=0)
    check("anonymous export refused", r.status in (302, 303, 307) and "text/csv" not in r.headers.get("content-type", ""), str(r.status))
    r = anon.get("/api/cms/crm-deals")
    check("anonymous CMS read of deals refused", r.status in (401, 403), str(r.status))
    r = anon.post("/api/cms/admins/first-register", data={"email": EMAIL, "password": PASSWORD, "name": "Admin Fixture"})
    check("first-register fixture admin", r.status in (200, 201), str(r.status))
    r = anon.post("/api/contact", headers={"Origin": BASE}, data={
        "name": "Visiteur Test", "company": "Société Fixture", "email": "visiteur@example.test",
        "phone": "778544646", "topic": "reseaux-cloud", "message": "Besoin d’un audit réseau\nsur deux sites.", "website": ""})
    check("contact fixture recorded", r.status == 201, str(r.status))

    # CMS upload with an accented file name is served by /media (regression: 404).
    import base64, urllib.parse, unicodedata
    token = anon.post("/api/cms/admins/login", data={"email": EMAIL, "password": PASSWORD}).json().get("token")
    jpeg = base64.b64decode("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==")
    r = anon.post("/api/cms/media", headers={"Authorization": f"JWT {token}", "Origin": BASE},
                  multipart={"file": {"name": "Douanes_sénégalaises.jpg", "mimeType": "image/jpeg", "buffer": jpeg}, "_payload": '{"alt":"Logo Douane Sénégal"}'})
    stored = r.json().get("doc", {}).get("filename", "") if r.ok else ""
    check("accented upload stored", r.status in (200, 201) and "é" in stored, f"{r.status} {stored}")
    for form in ("NFC", "NFD"):
        r = anon.get("/media/" + urllib.parse.quote(unicodedata.normalize(form, stored)))
        check(f"accented media served ({form} URL)", r.status == 200 and r.headers.get("content-type") == "image/jpeg", str(r.status))
    check("traversal still refused", anon.get("/media/..%2Fpackage.json").status in (400, 404))

    browser = p.chromium.launch()
    errors = []
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="fr-FR")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("dialog", lambda d: d.accept())
    page.goto(BASE + "/admin/login")
    page.fill("input[name=email]", EMAIL)
    page.fill("input[name=password]", PASSWORD)
    page.locator("button[type=submit]").click()
    page.wait_for_url("**/admin", timeout=30000)
    page.wait_for_load_state("networkidle")
    check("admin dashboard links to CRM", page.locator("a[href='/crm']").count() >= 1)
    nav = page.locator("nav").first
    check("admin navigation links to /crm", nav.locator("a.sync-nav-crm[href='/crm']").count() == 1)
    check("CRM collections not duplicated in admin navigation",
          all(label not in nav.inner_text() for label in ("Opportunités", "Devis et factures", "Activités et tâches")))
    check("admin CRM collection view not exposed", page.goto(BASE + "/admin/collections/crm-deals").status == 404)
    page.goto(BASE + "/admin")
    api = page.evaluate("fetch('/api/cms/crm-deals?limit=1', {credentials: 'include'}).then(r => r.status)")
    check("CRM collections still served by the API", api == 200, str(api))

    page.goto(BASE + "/crm")
    check("home page is today's to-do", page.locator("h1").inner_text() == "Aujourd’hui")
    check("dashboard lists unconverted request", "Société Fixture" in page.locator(".crm-card", has_text="Demandes du site").inner_text())
    page.screenshot(path=f"{OUT}/crm-dashboard-empty.png", full_page=True)

    # Website request -> prospect, contact, activity and first deal.
    page.goto(BASE + "/crm/demandes")
    card = page.locator("article.crm-card", has_text="Société Fixture")
    check("request shown as to process", card.locator(".crm-badge", has_text="À traiter").count() == 1)
    page.screenshot(path=f"{OUT}/crm-requests.png", full_page=True)
    card.locator("button", has_text="Convertir").click()
    page.wait_for_url(re.compile(r".*/crm/clients/\d+.*"))
    client_a = int(re.search(r"/crm/clients/(\d+)", page.url).group(1))
    body = page.locator("main").inner_text()
    check("conversion flash", "Demande convertie" in flash(page), flash(page))
    check("converted company is a prospect", page.locator(".crm-head .crm-badge").inner_text() == "Prospect")
    check("contact created from request", "Visiteur Test" in body and "visiteur@example.test" in body)
    check("activity holds the message", "Demande reçue via le formulaire du site" in body and "Besoin d’un audit réseau" in body)
    check("first deal created", "Réseaux et cloud — Société Fixture" in body)
    page.goto(BASE + "/crm/demandes")
    check("converted request no longer to process", page.locator("article.crm-card").count() == 0)
    page.goto(BASE + "/crm/demandes?filtre=toutes")
    check("request marked converted", page.locator(".crm-badge", has_text="Convertie").count() == 1)

    # Pipeline: move the deal to won -> the prospect becomes a client.
    page.goto(BASE + "/crm/opportunites")
    deal = page.locator("#etape-lead article.crm-deal", has_text="Société Fixture")
    check("deal in lead column", deal.count() == 1)
    page.screenshot(path=f"{OUT}/crm-pipeline.png", full_page=True)
    deal.locator("select[name=stage]").select_option("won")
    submit(page, deal.locator("button", has_text="OK"))
    check("stage moved", "Étape mise à jour" in flash(page), flash(page))
    check("won deal left the open board", page.locator("article.crm-deal", has_text="Société Fixture").count() == 0)
    page.goto(BASE + "/crm/opportunites?vue=conclues")
    check("won deal listed as closed", "Gagnée" in page.locator("main").inner_text())
    page.goto(f"{BASE}/crm/clients/{client_a}")
    check("won deal promoted prospect to client", page.locator(".crm-head .crm-badge").inner_text() == "Client")

    # Manual company, contact, overdue task.
    page.goto(BASE + "/crm/clients/nouveau")
    page.fill("input[name=name]", "=1+1 Fixture SARL")
    page.fill("input[name=city]", "Dakar")
    page.fill("input[name=website]", "exemple-fixture.sn")
    page.fill("input[name=email]", "pas-un-email")
    page.locator("button", has_text="Créer l’entreprise").click()
    page.wait_for_timeout(500)
    check("invalid email blocked before sending", "/crm/clients/nouveau" in page.url and page.locator("input[name=email]:invalid").count() == 1)
    page.fill("input[name=email]", "")
    page.locator("button", has_text="Créer l’entreprise").click()
    page.wait_for_url(re.compile(r".*/crm/clients/\d+.*"))
    client_b = int(re.search(r"/crm/clients/(\d+)", page.url).group(1))
    check("company created", "Entreprise enregistrée" in flash(page), flash(page))
    check("website normalised to https", page.locator("a[href='https://exemple-fixture.sn']").count() == 1)
    add = page.locator("details.crm-add", has_text="Ajouter un contact")
    add.locator("summary").click()
    add.locator("input[name=name]").fill("Awa Fixture")
    add.locator("input[name=jobTitle]").fill("DSI")
    add.locator("textarea[name=notes]").fill("Préfère être contactée sur WhatsApp")
    add.locator("input[name=email]").fill("AWA@example.test")
    add.locator("input[name=primary]").check()
    submit(page, add.locator("button[type=submit]"))
    check("contact added", "Contact enregistré" in flash(page) and "awa@example.test" in page.locator(".crm-people").inner_text(), flash(page))
    act = page.locator("details.crm-add", has_text="Noter un échange")
    act.locator("summary").click()
    act.locator("select[name=kind]").select_option("task")
    act.locator("input[name=subject]").fill("Relancer le devis fixture")
    act.locator("input[name=dueAt]").fill("2026-01-05T09:30")
    submit(page, act.locator("button[type=submit]"))
    check("overdue task shown as late", "En retard" in page.locator(".crm-timeline__item", has_text="Relancer le devis fixture").inner_text())
    page.screenshot(path=f"{OUT}/crm-client.png", full_page=True)

    # Cross-company contact on a deal is refused by the collection hook.
    page.goto(BASE + "/crm/opportunites")
    form = page.locator("#nouvelle form")
    form.locator("input[name=title]").fill("Opportunité incohérente")
    form.locator("select[name=client]").select_option(str(client_a))
    form.locator("select[name=contact]").select_option(label="Awa Fixture (=1+1 Fixture SARL)")
    submit(page, form.locator("button[type=submit]"))
    check("cross-company contact refused with explicit message", "n’appartient pas à cette entreprise" in flash(page), flash(page))
    form = page.locator("#nouvelle form")
    form.locator("input[name=title]").fill("Infogérance annuelle")
    form.locator("select[name=client]").select_option(str(client_b))
    form.locator("select[name=stage]").select_option("proposal")
    form.locator("input[name=amount]").fill("2 400 000")
    form.locator("button[type=submit]").click()
    page.wait_for_url(re.compile(r".*/crm/opportunites/\d+.*"))
    facts = page.locator(".crm-facts").inner_text()
    check("deal created with stage probability", "50 %" in facts and re.search(r"2\s?400\s?000 FCFA", facts) is not None, facts.replace("\n", " | "))

    # Drag and drop in the pipeline (same server action as the stage select).
    page.goto(BASE + "/crm/opportunites")
    card = page.locator("article.crm-deal", has_text="Infogérance annuelle")
    old = page.url
    card.drag_to(page.locator("#etape-negotiation"))
    page.wait_for_url(lambda u: u != old, timeout=30000)
    page.wait_for_load_state("networkidle")
    check("drag to Négociation moves the deal", page.locator("#etape-negotiation article.crm-deal", has_text="Infogérance annuelle").count() == 1, flash(page))
    page.screenshot(path=f"{OUT}/crm-pipeline-dnd.png", full_page=True)
    # Keyboard: handle, Enter, arrow to the previous column, Enter.
    handle = page.locator("article.crm-deal", has_text="Infogérance annuelle").locator("[data-handle]")
    handle.focus()
    page.keyboard.press("Enter")
    check("keyboard pick-up announced", "saisie" in page.locator(".crm-sr").inner_text())
    page.keyboard.press("ArrowLeft")
    with page.expect_response(lambda r: r.request.method == "POST" and "/crm" in r.url, timeout=30000):
        page.keyboard.press("Enter")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(300)
    check("keyboard move to Proposition", page.locator("#etape-proposal article.crm-deal", has_text="Infogérance annuelle").count() == 1, flash(page))
    # Pointer drag by the handle (the touch path; driven here by a mouse pointer).
    box = page.locator("article.crm-deal", has_text="Infogérance annuelle").locator("[data-handle]").bounding_box()
    target = page.locator("#etape-qualified").bounding_box()
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.mouse.down()
    page.mouse.move(target["x"] + target["width"] / 2, target["y"] + 60, steps=12)
    check("floating copy follows the pointer", page.locator(".crm-deal--ghost").count() == 1)
    with page.expect_response(lambda r: r.request.method == "POST" and "/crm" in r.url, timeout=30000):
        page.mouse.up()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(300)
    check("pointer drag by the handle to Qualifiée", page.locator("#etape-qualified article.crm-deal", has_text="Infogérance annuelle").count() == 1, flash(page))

    page.goto(BASE + "/crm/taches")
    late = page.locator(".crm-card", has_text="En retard")
    check("task in late group", "Relancer le devis fixture" in late.inner_text())
    submit(page, late.locator(".crm-timeline__item", has_text="Relancer le devis fixture").locator("button", has_text="Marquer comme faite"))
    # Last planned action of a company in progress: its page asks for the next one.
    check("last action done: company page asks for the next action",
          f"/crm/clients/{client_b}" in page.url and "planifiez la prochaine action" in flash(page), f"{page.url} {flash(page)}")
    page.goto(BASE + "/crm/taches")
    check("task completed", "Relancer le devis fixture" in page.locator(".crm-card", has_text="Récemment terminées").inner_text())
    page.screenshot(path=f"{OUT}/crm-tasks.png", full_page=True)
    check("reminders shown as not enabled on this server", "Rappels email non activés" in page.locator("main").inner_text())

    # Edit an activity.
    item = page.locator(".crm-timeline__item", has_text="Relancer le devis fixture").first
    item.locator("a", has_text="Modifier").click()
    page.wait_for_url(re.compile(r".*/crm/activites/\d+.*"))
    page.fill("input[name=subject]", "Relancer le devis fixture (modifiée)")
    page.locator("input[name=remind]").uncheck()
    submit(page, page.locator("button", has_text="Enregistrer les modifications"))
    check("activity edited", "Activité modifiée" in flash(page) and page.locator("input[name=subject]").input_value().endswith("(modifiée)"), flash(page))
    check("reminder option saved", not page.locator("input[name=remind]").is_checked())

    # Commercial follow-up (2026-10-10): home page, stages board, mandatory next action.
    home = lambda key: page.locator(f"section[aria-labelledby=today-{key}]")
    page.goto(BASE + "/crm")
    check("home: conversion created an action to answer the request", "Répondre à la demande de Visiteur Test" in home("actions").inner_text())
    check("home: action shows company, stage and person in charge",
          all(x in home("actions").inner_text() for x in ("Société Fixture", "Admin Fixture")), home("actions").inner_text()[:200])
    check("home: Support tickets card", home("tickets").count() == 1)
    check("home: company without next action listed", "=1+1 Fixture SARL" in home("unplanned").inner_text())
    page.screenshot(path=f"{OUT}/crm-home.png", full_page=True)
    row = home("unplanned").locator("li", has_text="=1+1 Fixture SARL")
    row.locator("input[name=nextDueAt]").fill("2030-01-15T10:00")
    submit(page, row.locator("button", has_text="Planifier"))
    check("home: quick planning recorded", "prochaine action planifiée" in flash(page), flash(page))
    check("home: planned company left the list", "=1+1 Fixture SARL" not in home("unplanned").inner_text())
    page.goto(BASE + "/crm?pour=moi")
    check("home: « Mes actions » view", page.locator(".crm-tabs a[aria-current=page]").inner_text() == "Mes actions")

    page.goto(BASE + "/crm/suivi")
    card = page.locator("#etape-to-contact article.crm-deal", has_text="=1+1 Fixture SARL")
    check("board: new company « À contacter » with its next action", card.count() == 1 and "15 janv. 2030" in card.inner_text(), card.inner_text() if card.count() else "")
    check("board: company won through its deal is not on the board", page.locator("article.crm-deal", has_text="Société Fixture").count() == 0)
    page.screenshot(path=f"{OUT}/crm-follow-board.png", full_page=True)
    old = page.url
    card.drag_to(page.locator("#etape-need"))
    page.wait_for_url(lambda u: u != old, timeout=30000)
    page.wait_for_load_state("networkidle")
    check("board: drag to « Besoin identifié »", page.locator("#etape-need article.crm-deal", has_text="=1+1 Fixture SARL").count() == 1, flash(page))

    page.goto(f"{BASE}/crm/clients/{client_b}")
    box = page.locator("#suivi")
    check("company: stage and next action shown", "Besoin identifié" in box.inner_text() and "15 janv. 2030" in box.inner_text(), box.inner_text()[:200])
    def follow_up(close=True, subject="", stage=None, reason=None, due=None, kind=None):
        details = page.locator("#suivi details")
        if not details.evaluate("d => d.open"):
            details.locator("summary").click()
        f = details.locator("form")
        if close:
            f.locator("select[name=close]").select_option(index=1)
        f.locator("input[name=subject]").fill(subject)
        if stage:
            f.locator("select[name=pipeline]").select_option(stage)
        if reason is not None:
            f.locator("select[name=lostReason]").select_option(reason)
        f.locator("input[name=nextDueAt]").fill(due or "")
        if kind:
            f.locator("select[name=nextKind]").select_option(kind)
        submit(page, f.locator("button", has_text="Enregistrer le suivi"))
    follow_up(subject="Intéressé, budget en janvier", stage="on-hold")
    check("follow-up refused without a next action", "Planifiez la prochaine action" in flash(page), flash(page))
    check("refused follow-up changed nothing", "Besoin identifié" in page.locator("#suivi").inner_text())
    follow_up(subject="Intéressé, budget en janvier", stage="on-hold", due="2030-03-01T09:00", kind="email")
    msg = flash(page)
    check("follow-up: action done, stage and next action saved",
          all(x in msg for x in ("action terminée", "En attente (budget)", "prochaine action planifiée")), msg)
    check("follow-up: report kept on the done action", "Compte rendu : Intéressé, budget en janvier" in page.locator("main").inner_text())
    check("follow-up: new next action shown", "1 mars 2030" in page.locator("#suivi").inner_text(), page.locator("#suivi").inner_text()[:200])
    follow_up(close=False, stage="lost", reason="")
    check("loss refused without its reason", "raison de la perte" in flash(page), flash(page))
    follow_up(close=False, stage="lost", reason="competitor")
    check("loss saved with its reason", "Perdu" in flash(page) and "Concurrent retenu" in page.locator("#suivi").inner_text(), flash(page))
    page.goto(BASE + "/crm/suivi")
    check("lost company left the board", page.locator("article.crm-deal", has_text="=1+1 Fixture SARL").count() == 0)
    page.goto(BASE + "/crm/clients?etape=lost")
    check("companies list filtered on « Perdu »", "=1+1 Fixture SARL" in page.locator("main").inner_text())
    exported = page.request.get(BASE + "/crm/export/clients").text()
    check("export carries stage and loss reason", "Perdu;Concurrent retenu" in exported, exported[:200])
    page.goto(f"{BASE}/crm/clients/{client_a}")
    check("won deal won the company follow-up", "Gagné" in page.locator("#suivi").inner_text())

    # Accent-free and typo-tolerant search.
    page.goto(BASE + "/crm/clients?q=societe")
    check("search without accent", "Société Fixture" in page.locator("main").inner_text())
    page.goto(BASE + "/crm/clients?q=socitee")
    check("search with a typo", "Société Fixture" in page.locator("main").inner_text())
    page.goto(BASE + "/crm/recherche?q=AWA")
    check("global search finds the contact", "Awa Fixture" in page.locator("main").inner_text())
    page.goto(BASE + "/crm/recherche?q=whatsap")
    check("search in notes, with a typo", "Awa Fixture" in page.locator("main").inner_text())
    page.goto(BASE + "/crm/recherche?q=relancer%20devis")
    check("global search finds the activity", "Relancer le devis fixture" in page.locator("main").inner_text())
    page.goto(BASE + "/crm/taches?q=relancer")
    check("tasks page search", "Relancer le devis fixture" in page.locator("main").inner_text())

    # Quote (two VAT rates) -> sent -> accepted (deal won) -> 30 % deposit -> paid ->
    # final invoice minus the deposit -> partial payment -> credit note -> settled.
    def money_in(text, amount):
        return re.search(amount.replace(" ", r"\s?") + " FCFA", text) is not None
    def balance_text():
        return page.locator(".crm-facts").inner_text()
    page.goto(BASE + "/crm/opportunites")
    form = page.locator("#nouvelle form")
    form.locator("input[name=title]").fill("Maintenance annuelle")
    form.locator("select[name=client]").select_option(str(client_a))
    form.locator("select[name=stage]").select_option("proposal")
    form.locator("button[type=submit]").click()
    page.wait_for_url(re.compile(r".*/crm/opportunites/\d+.*"))
    deal_url = page.url.split("?")[0]
    page.locator("a", has_text="+ Devis pour cette opportunité").click()
    page.wait_for_url(re.compile(r".*/crm/documents/nouveau.*"))
    page.fill("input[name=title]", "Contrat de maintenance 2027")
    page.fill("textarea[name=line-0-description]", "Maintenance préventive trimestrielle")
    page.fill("input[name=line-0-quantity]", "4")
    page.fill("input[name=line-0-unit]", "visite")
    page.fill("input[name=line-0-unitPrice]", "150 000")
    page.fill("textarea[name=line-1-description]", "Formation (exonérée)")
    page.fill("input[name=line-1-unitPrice]", "100000")
    page.fill("input[name=line-1-vatRate]", "0")
    page.fill("textarea[name=conditions]", "Paiement à 30 jours.")
    page.locator("button", has_text="Créer le devis").click()
    page.wait_for_url(re.compile(r".*/crm/documents/\d+.*"))
    quote_url = page.url.split("?")[0]
    facts = balance_text()
    check("quote totals with two VAT rates", money_in(facts, "700 000") and money_in(facts, "108 000") and money_in(facts, "808 000") and "TVA 0 %" in facts, facts.replace("\n", " | "))
    check("draft has no number", "Devis brouillon" in page.locator("h1").inner_text())
    submit(page, page.locator("button", has_text="Marquer comme envoyé"))
    check("sent quote numbered", "DEV-2026-0001" in page.locator("h1").inner_text(), page.locator("h1").inner_text())
    page.locator("button", has_text="Accepté par le client").click()
    page.wait_for_selector(".crm-head .crm-badge:has-text('Accepté')", timeout=30000)
    page.goto(deal_url)
    check("accepted quote wins its deal", "Gagnée" in page.locator(".crm-head .crm-badge").inner_text())
    page.goto(quote_url)
    page.fill("input[name=percent]", "30")
    page.locator("button", has_text="Créer la facture d’acompte").click()
    page.wait_for_url(lambda u: u.split("?")[0] != quote_url, timeout=30000)
    page.wait_for_load_state("networkidle")
    deposit_url = page.url.split("?")[0]
    check("deposit invoice: 30 % of each rate", "Facture d’acompte brouillon" in page.locator("h1").inner_text() and money_in(balance_text(), "242 400"), balance_text().replace("\n", " | "))
    submit(page, page.locator("button", has_text="Émettre la facture"))
    check("deposit numbered FAC-2026-0001", "FAC-2026-0001" in page.locator("h1").inner_text())
    submit(page, page.locator("button", has_text="Enregistrer le paiement"))
    check("deposit settled by one payment", "Soldée" in page.locator(".crm-head .crm-badge").inner_text())
    page.goto(quote_url)
    page.locator("button", has_text="Créer la facture de solde").click()
    page.wait_for_url(lambda u: u.split("?")[0] != quote_url, timeout=30000)
    page.wait_for_load_state("networkidle")
    final_url = page.url.split("?")[0]
    lines_text = " ".join(page.locator("textarea[name$=-description]").evaluate_all("els => els.map(e => e.value)"))
    check("final invoice deducts the deposit", money_in(balance_text(), "565 600") and "Déduction de l’acompte FAC-2026-0001" in lines_text, balance_text().replace("\n", " | "))
    submit(page, page.locator("button", has_text="Émettre la facture"))
    check("final invoice numbered FAC-2026-0002", "FAC-2026-0002" in page.locator("h1").inner_text())
    check("issued invoice no longer editable", page.locator("textarea[name=line-0-description]").count() == 0)
    page.fill("input[name=amount]", "200000")
    page.fill("input[name=note]", "Virement fixture")
    submit(page, page.locator("button", has_text="Enregistrer le paiement"))
    check("partial payment", "Partiellement payée" in page.locator(".crm-head .crm-badge").inner_text() and money_in(balance_text(), "365 600"), balance_text().replace("\n", " | "))
    page.goto(BASE + "/crm")
    check("dashboard shows the balance to collect", money_in(page.locator(".crm-stats").inner_text(), "365 600"))
    page.goto(final_url)
    page.fill("input[name=amount]", "999999999")
    submit(page, page.locator("button", has_text="Enregistrer le paiement"))
    check("overpayment refused, back on the invoice", "dépassent" in flash(page) and "FAC-2026-0002" in page.locator("h1").inner_text(), flash(page))
    submit(page, page.locator("button", has_text="Annuler la facture"))
    check("paid invoice cannot be cancelled", "ne s’annule pas" in flash(page), flash(page))
    page.locator("button", has_text="Créer un avoir").click()
    page.wait_for_url(lambda u: u.split("?")[0] != final_url, timeout=30000)
    page.wait_for_load_state("networkidle")
    credit_url = page.url.split("?")[0]
    check("credit note drafted from the invoice", "Avoir brouillon" in page.locator("h1").inner_text())
    submit(page, page.locator("button", has_text="Émettre l’avoir"))
    check("credit above the invoice refused", "dépasse" in flash(page), flash(page))
    page.fill("input[name=line-0-quantity]", "1")
    submit(page, page.locator("button", has_text="Enregistrer"))
    check("partial credit totals", money_in(balance_text(), "277 000"), balance_text().replace("\n", " | "))
    submit(page, page.locator("button", has_text="Émettre l’avoir"))
    check("credit note numbered AV-2026-0001", "AV-2026-0001" in page.locator("h1").inner_text(), page.locator("h1").inner_text())
    page.goto(final_url)
    check("credit lowers the balance", money_in(balance_text(), "88 600") and "AV-2026-0001" in page.locator("main").inner_text(), balance_text().replace("\n", " | "))
    submit(page, page.locator("button", has_text="Enregistrer le paiement"))
    check("invoice settled after payment and credit", "Soldée" in page.locator(".crm-head .crm-badge").inner_text())
    check("e-mail sending shown as not enabled here", "pas activé sur ce serveur" in page.locator("main").inner_text())
    r = page.request.get(final_url + "/pdf")
    check("PDF download", r.status == 200 and r.headers["content-type"] == "application/pdf" and r.body()[:5] == b"%PDF-" and "no-store" in r.headers.get("cache-control", ""), str(r.status))
    check("credit note PDF", page.request.get(credit_url + "/pdf").body()[:5] == b"%PDF-")
    page.locator("a", has_text="Aperçu et impression").click()
    page.wait_for_url(re.compile(r".*/apercu$"))
    sheet = page.locator(".crm-sheet").inner_text()
    check("printable invoice", all(x in sheet for x in ["FAC-2026-0002", "Société Fixture", "NINEA 005812351 1R1", "TVA 0 %", "Déduction de l’acompte", "Avoirs déduits"]), sheet[:200])
    page.screenshot(path=f"{OUT}/crm-invoice-preview.png", full_page=True)
    page.emulate_media(media="print")
    check("print hides the CRM menu", not page.locator(".crm-side").is_visible() and not page.locator(".crm-preview-bar").is_visible())
    page.screenshot(path=f"{OUT}/crm-invoice-print.png", full_page=True)
    page.emulate_media(media="screen")
    page.goto(final_url)
    page.screenshot(path=f"{OUT}/crm-invoice-detail.png", full_page=True)
    r = page.request.get(BASE + "/crm/export/documents")
    check("documents CSV export", r.status == 200 and all(x in r.text() for x in ["FAC-2026-0002", "DEV-2026-0001", "AV-2026-0001", "Facture d’acompte"]))

    page.goto(BASE + "/crm")
    stats = page.locator(".crm-stats").inner_text()
    check("dashboard counts", re.search(r"2\s?400\s?000 FCFA", stats) is not None and "Gagné ce mois" in stats, stats.replace("\n", " | "))
    page.screenshot(path=f"{OUT}/crm-dashboard.png", full_page=True)

    page.goto(BASE + "/crm/clients?statut=prospect")
    check("stage filter", page.locator("tbody tr").count() == 1 and "=1+1 Fixture SARL" in page.locator("tbody").inner_text())
    page.goto(BASE + "/crm/clients?q=soci%C3%A9t%C3%A9")
    check("search", page.locator("tbody tr").count() == 1 and "Société Fixture" in page.locator("tbody").inner_text())
    r = page.request.get(BASE + "/crm/export/clients")
    text = r.text()
    check("CSV export", r.status == 200 and "text/csv" in r.headers["content-type"] and "no-store" in r.headers.get("cache-control", ""), str(r.status))
    check("CSV formula neutralised", "'=1+1 Fixture SARL" in text and "\n=1+1" not in text)
    check("unknown export 404", page.request.get(BASE + "/crm/export/inconnu").status == 404)

    # Client portal account: invitation, activation, then no CRM access.
    r = page.request.post(BASE + "/api/team/invitations", headers={"Origin": BASE},
                          data={"name": "Utilisateur Fixture", "email": "utilisateur@example.test", "client": client_a})
    token = r.json().get("invitationURL", "#").split("#")[1]
    r = anon.post("/api/support/activate", headers={"Origin": BASE}, data={"token": token, "password": "fixture-activation-password"})
    check("fixture client account activated", r.status == 200, str(r.status))
    client_ctx = p.request.new_context(base_url=BASE)
    r = client_ctx.post("/api/support/login", headers={"Origin": BASE}, data={"email": "utilisateur@example.test", "password": "fixture-activation-password"})
    check("client account login", r.status == 200, str(r.status))
    check("client account gets 404 on /crm", client_ctx.get("/crm", max_redirects=0).status == 404)
    check("client account gets 404 on export", client_ctx.get("/crm/export/clients", max_redirects=0).status == 404)
    check("client account cannot read CRM via CMS API", client_ctx.get("/api/cms/crm-contacts").status in (401, 403))

    page.goto(BASE + "/crm/opportunites")
    old = page.url
    page.locator("article.crm-deal", has_text="Infogérance annuelle").drag_to(page.locator(".crm-dropzone--lost"))
    page.wait_for_url(lambda u: u != old, timeout=30000)
    page.wait_for_load_state("networkidle")
    check("drop on Perdue closes the deal", page.locator("article.crm-deal", has_text="Infogérance annuelle").count() == 0, flash(page))

    # Company with Support users cannot be deleted; the other one can.
    page.goto(f"{BASE}/crm/clients/{client_a}")
    check("delete hidden for company with Support users", page.locator("button", has_text="Supprimer l’entreprise").count() == 0)
    page.goto(f"{BASE}/crm/clients/{client_b}")
    page.locator("button", has_text="Supprimer l’entreprise").click()
    page.wait_for_url(re.compile(r".*/crm/clients\?.*"))
    check("company deleted with children", "supprimée" in flash(page) and "=1+1 Fixture SARL" not in page.locator("main").inner_text(), flash(page))
    page.goto(BASE + "/crm/opportunites")
    check("its deal deleted too", page.locator("h1").inner_text() == "Opportunités" and "Infogérance annuelle" not in page.locator("main").inner_text())

    # CSV import: preview writes nothing, import is one transaction, re-import never duplicates.
    # « anon » holds a CMS login cookie since the media upload: a fresh context is anonymous.
    nobody = p.request.new_context(base_url=BASE)
    r = nobody.get("/crm/clients/importer", max_redirects=0)
    check("anonymous import page redirected", r.status in (302, 303, 307) and "/admin/login" in r.headers.get("location", ""), str(r.status))
    check("anonymous template refused", "text/csv" not in nobody.get("/crm/export/modele-clients", max_redirects=0).headers.get("content-type", ""))
    tpl = ctx.request.get(BASE + "/crm/export/modele-clients")
    check("import template downloads", tpl.status == 200 and "text/csv" in tpl.headers["content-type"] and "Entreprise;Statut;Origine" in tpl.text(), str(tpl.status))
    rows = "\r\n".join([
        "Entreprise;Statut;Origine;Email;Téléphone;Site web;Ville;Responsable",
        "Import Alpha SARL;;Prospection directe;contact@alpha-import.sn;'+221 33 111 22 33;alpha-import.sn;Thiès;X",
        "Import Béta;Client;;;;;Dakar;",
        "Société Fixture;;;;;;Rufisque;",
        "Mauvais email;;;pas-un-email;;;;",
        "import alpha sarl;;;;;;;",
    ]) + "\r\n"
    def preview(buffer, duplicates="skip"):
        page.goto(BASE + "/crm/clients/importer")
        page.set_input_files("input[name=file]", files=[{"name": "prospects.csv", "mimeType": "text/csv", "buffer": buffer}])
        page.select_option("select[name=duplicates]", duplicates)
        page.locator("button", has_text="Vérifier le fichier").click()
        page.wait_for_selector("text=2. Vérifier puis importer", timeout=30000)
        return page.locator(".crm-stat strong").all_inner_texts()
    page.goto(BASE + "/crm/clients")
    page.locator("a", has_text="Importer (CSV)").click()
    page.wait_for_url("**/crm/clients/importer")
    check("import page reached from the list", page.locator("h1").inner_text() == "Importer des entreprises")
    stats = preview(("\ufeff" + rows).encode("utf-8"))
    body = page.locator("main").inner_text()
    check("import preview counts (create, complete, skip, error)", stats == ["2", "0", "1", "2"], str(stats))
    check("preview explains each refused line", "doublon de la ligne 2" in body and "Email invalide" in body and "Responsable" in body, body[-400:])
    check("preview wrote nothing", "Import Alpha" not in ctx.request.get(BASE + "/crm/export/clients").text())
    page.screenshot(path=f"{OUT}/crm-import-preview.png", full_page=True)
    submit(page, page.locator("button", has_text="Importer 2 entreprises"))
    msg = flash(page)
    check("import flash summary", "2 entreprises créées" in msg and "1 ignorée" in msg and "2 lignes en erreur" in msg, msg)
    exported = ctx.request.get(BASE + "/crm/export/clients").text()
    check("imported values stored", all(x in exported for x in ["Import Alpha SARL;Prospect;Prospection directe;", "contact@alpha-import.sn", "'+221 33 111 22 33", "https://alpha-import.sn", "Import Béta;Client"]), exported[-300:])
    check("importer set as owner", "Import Alpha SARL" in page.locator("main").inner_text() and "Admin Fixture" in page.locator("tr", has_text="Import Alpha SARL").inner_text())
    page.goto(BASE + "/crm/recherche?q=alpha+import")
    check("imported company searchable", "Import Alpha SARL" in page.locator("main").inner_text())
    # Same file saved by Excel (Windows-1252), completion mode: only empty fields are filled.
    stats = preview(rows.encode("cp1252"), "complete")
    check("re-import plans no duplicate", stats == ["0", "1", "2", "2"], str(stats))
    submit(page, page.locator("button", has_text="Importer 1 entreprise"))
    check("completion flash", "1 complétée" in flash(page) and "0 entreprise créée" in flash(page), flash(page))
    exported = ctx.request.get(BASE + "/crm/export/clients").text()
    check("existing company completed, nothing duplicated", exported.count("Import Alpha SARL") == 1 and any(l.startswith("Société Fixture;") and "Rufisque" in l for l in exported.splitlines()), "")
    stats = preview(rows.encode("utf-8"), "complete")
    check("third pass has nothing to do", stats == ["0", "0", "3", "2"] and page.locator("button", has_text="Importer").count() == 0, str(stats))

    # WhatsApp: wa.me link only. wa.me is stubbed in the browser (no request leaves the
    # internal network, no message is sent) and nothing is written to the CRM.
    # Fresh token: sessions may have been revoked by the logouts above.
    token = anon.post("/api/cms/admins/login", data={"email": EMAIL, "password": PASSWORD}).json().get("token")
    api = {"Authorization": f"JWT {token}", "Origin": BASE}
    def create(collection, data):
        r = anon.post(f"/api/cms/{collection}", headers=api, data=data)
        return r.json()["doc"]["id"] if r.ok else check(f"fixture {collection} created", False, f"{r.status} {r.text()[:200]}")
    wa_multi = create("clients", {"name": "WA Multi SARL", "stage": "prospect", "phone": "33 800 00 00", "country": "Sénégal"})
    create("crm-contacts", {"name": "Awa Fixture", "client": wa_multi, "phone": "77 123 45 67", "primary": True})
    moussa = create("crm-contacts", {"name": "Moussa Fixture", "client": wa_multi, "phone": "WhatsApp : +221 (78) 222-33-44"})
    sans = create("crm-contacts", {"name": "Sans Numéro", "client": wa_multi})
    wa_direct = create("clients", {"name": "WA Direct", "stage": "prospect", "phone": "WhatsApp 00221 76.111.22.33", "country": "Sénégal"})
    wa_ambigu = create("clients", {"name": "WA Ambigu", "stage": "prospect", "phone": "77 000 11 22", "country": ""})
    snapshot = lambda: (ctx.request.get(BASE + "/crm/export/clients").text(), ctx.request.get(BASE + "/crm/export/contacts").text(),
                        anon.get("/api/cms/crm-activities?limit=0", headers=api).json().get("totalDocs"))
    before = snapshot()
    opened = []
    ctx.route("https://wa.me/**", lambda route: (opened.append(route.request.url), route.fulfill(status=200, content_type="text/html", body="stub")))

    page.goto(BASE + f"/crm/clients/{wa_direct}")
    link = page.locator(".crm-wa a")
    check("WhatsApp direct link for a single labelled number", link.get_attribute("href") == "https://wa.me/221761112233", str(link.get_attribute("href")))
    check("WhatsApp link opens a new tab safely", link.get_attribute("target") == "_blank" and "noopener" in (link.get_attribute("rel") or ""))
    check("WhatsApp link labelled with icon and text", "Ouvrir WhatsApp" in link.inner_text() and link.locator("svg").count() == 1 and "WA Direct" in (link.get_attribute("aria-label") or ""))
    page.locator("summary", has_text="Noter un échange").click()
    page.fill("input[name=subject]", "Brouillon en cours")
    url = page.url
    with ctx.expect_page() as new:
        link.click()
    new.value.wait_for_load_state()
    check("WhatsApp opened beside the CRM", new.value.url == "https://wa.me/221761112233" and page.url == url, f"{new.value.url} {page.url}")
    check("form in progress kept", page.input_value("input[name=subject]") == "Brouillon en cours")
    new.value.close()

    page.goto(BASE + f"/crm/clients/{wa_multi}")
    toggle = page.locator(".crm-wa > button")
    check("several interlocutors: a choice, no direct link", toggle.count() == 1 and page.locator(".crm-wa a[href^='https://wa.me']").count() == 0)
    toggle.focus()
    page.keyboard.press("Enter")
    panel = page.locator(".crm-wa__panel")
    check("WhatsApp panel opens from the keyboard", panel.is_visible() and toggle.get_attribute("aria-expanded") == "true")
    options = panel.locator(".crm-wa__option").all_inner_texts()
    check("all numbers offered, labelled WhatsApp first, none preselected",
          len(options) == 3 and options[0].startswith("Moussa Fixture") and "Indiqué WhatsApp" in options[0]
          and "WA Multi SARL" in options[1] and "Awa Fixture" in options[2] and panel.locator("input:checked").count() == 0, " | ".join(options))
    check("contact without number reported with a fix link", "Sans Numéro" in panel.inner_text() and panel.locator(f"a[href='/crm/contacts/{sans}#modifier']").count() == 1)
    check("no link before a choice", panel.locator("a[href^='https://wa.me']").count() == 0)
    panel.locator(".crm-wa__option", has_text="Moussa Fixture").locator("input").check()
    check("labelled number: link without confirmation", panel.locator("a[href='https://wa.me/221782223344']").count() == 1 and panel.locator("input[type=checkbox]").count() == 0)
    panel.locator(".crm-wa__option", has_text="Awa Fixture").locator("input").check()
    check("unlabelled number needs confirmation", panel.locator("a[href^='https://wa.me']").count() == 0 and "pas indiqué comme WhatsApp" in panel.inner_text())
    panel.locator("input[type=checkbox]").check()
    go = panel.locator("a[href='https://wa.me/221771234567']")
    check("confirmed number: link built", go.count() == 1 and go.get_attribute("target") == "_blank")
    page.screenshot(path=f"{OUT}/crm-whatsapp-choice.png", full_page=True)
    with ctx.expect_page() as new:
        go.click()
    new.value.wait_for_load_state()
    check("chosen interlocutor opened, CRM page kept", new.value.url == "https://wa.me/221771234567" and panel.is_visible())
    new.value.close()
    page.keyboard.press("Escape")
    check("Escape closes the panel and returns focus", panel.count() == 0 and page.evaluate("document.activeElement.getAttribute('aria-expanded')") == "false")

    page.goto(BASE + f"/crm/clients/{wa_ambigu}")
    page.locator(".crm-wa > button").click()
    text = page.locator(".crm-wa__panel").inner_text()
    check("missing country code never guessed", "Aucun numéro utilisable" in text and "Indicatif manquant" in text and page.locator(".crm-wa__option").count() == 0, text[:200])
    page.locator(".crm-wa__panel a", has_text="Corriger les coordonnées").click()
    check("fix link opens the company form on the phone field",
          page.evaluate("document.getElementById('coordonnees').open && document.activeElement.name === 'phone'"))

    page.goto(BASE + f"/crm/contacts/{moussa}")
    check("contact page: direct link to that contact", page.locator(".crm-wa a").get_attribute("href") == "https://wa.me/221782223344")
    page.goto(BASE + f"/crm/contacts/{sans}")
    page.locator(".crm-wa > button").click()
    page.locator(".crm-wa__panel a", has_text="Corriger les coordonnées").click()
    check("contact without number: fix focuses its phone field", page.evaluate("document.activeElement.name === 'phone'"))
    after = snapshot()
    check("WhatsApp clicks changed no data and created no activity", after == before, f"activities {before[2]} -> {after[2]}")
    check("only stubbed wa.me requests", opened == ["https://wa.me/221761112233", "https://wa.me/221771234567"], str(opened))
    wa_page = f"/crm/clients/{wa_multi}"

    # Back-office profiles (2026-10-10): CRM-only assistant and technician (tickets only).
    api = p.request.new_context(base_url=BASE)
    def auth(t):
        return {"Authorization": f"JWT {t}", "Origin": BASE}
    def login(email, password):
        return api.post("/api/cms/admins/login", data={"email": email, "password": password}).json().get("token")
    owner = login(EMAIL, PASSWORD)
    me = api.get("/api/cms/admins/me", headers=auth(owner)).json().get("user") or {}
    check("bootstrap account is a full administrator managing accounts", me.get("role") == "full" and me.get("manageAdmins") is True, str(me.get("role")))
    staff = {}
    for role, email in (("crm", "assistante@example.test"), ("technician", "technicien@example.test")):
        r = api.post("/api/cms/admins", headers=auth(owner), data={"name": f"Fixture {role}", "email": email, "password": "fixture-password-123456", "role": role, "mailAccess": "none"})
        check(f"owner creates a {role} account", r.status == 201, f"{r.status} {r.text()[:150]}")
        staff[role] = (email, login(email, "fixture-password-123456"))
    crm_t, tech_t = staff["crm"][1], staff["technician"][1]
    r = api.post("/api/cms/admins", headers=auth(crm_t), data={"name": "X", "email": "x@example.test", "password": "fixture-password-123456", "role": "full"})
    check("CRM account cannot create accounts", r.status in (401, 403), str(r.status))
    crm_me = api.get("/api/cms/admins/me", headers=auth(crm_t)).json()["user"]
    api.patch(f"/api/cms/admins/{crm_me['id']}", headers=auth(crm_t), data={"role": "full", "name": "Assistante"})
    check("own profile cannot be raised", api.get("/api/cms/admins/me", headers=auth(crm_t)).json()["user"]["role"] == "crm")
    ticket = api.post("/api/cms/tickets", headers=auth(owner), data={"subject": "Panne imprimante fixture", "category": "reseaux-cloud", "description": "Ne s’allume plus", "client": client_a}).json().get("doc", {}).get("id")
    check("fixture ticket created", ticket is not None)
    def status(method, url, token, data=None):
        return getattr(api, method)(url, headers=auth(token), **({"data": data} if data is not None else {})).status
    def readable(url, token):
        r = api.get(url, headers=auth(token))
        return r.status == 200 and r.json().get("totalDocs", 0) > 0
    # CRM-only account.
    check("CRM: reads CRM data and site requests", readable("/api/cms/crm-deals", crm_t) and readable("/api/cms/contact-requests", crm_t))
    check("CRM: no Support data", not readable("/api/cms/tickets", crm_t) and not readable("/api/cms/ticket-notes", crm_t) and not readable("/api/cms/client-accounts", crm_t))
    check("CRM: no site content write", status("post", "/api/cms/projects", crm_t, {"name": "x"}) in (401, 403))
    r = api.post("/api/cms/crm-documents", headers=auth(crm_t), data={"kind": "quote", "title": "Devis préparé par l’assistante", "client": client_a, "lines": [{"description": "Audit", "quantity": 1, "unitPrice": 100000}]})
    draft = r.json().get("doc", {}).get("id") if r.ok else None
    check("CRM: prepares a draft quote", r.status == 201, f"{r.status} {r.text()[:150]}")
    r = api.patch(f"/api/cms/crm-documents/{draft}", headers=auth(crm_t), data={"status": "sent"})
    check("CRM: cannot issue it", r.status == 400 and "administrateur complet" in r.text(), f"{r.status} {r.text()[:150]}")
    # Technician.
    check("technician: reads and handles tickets", readable("/api/cms/tickets", tech_t)
          and status("patch", f"/api/cms/tickets/{ticket}", tech_t, {"status": "in-progress"}) == 200
          and status("post", "/api/cms/ticket-notes", tech_t, {"ticket": ticket, "note": "Passage prévu demain"}) == 201)
    check("technician: cannot delete a ticket", status("delete", f"/api/cms/tickets/{ticket}", tech_t) in (401, 403))
    check("technician: company readable, not editable", readable("/api/cms/clients", tech_t) and status("patch", f"/api/cms/clients/{client_a}", tech_t, {"name": "x"}) in (401, 403))
    check("technician: no CRM or site requests", not readable("/api/cms/crm-deals", tech_t) and not readable("/api/cms/contact-requests", tech_t))
    # Interfaces.
    for role, path in (("crm", "/crm"), ("technician", "/admin")):
        c = browser.new_context(viewport={"width": 1440, "height": 900}, locale="fr-FR")
        pg = c.new_page()
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(BASE + "/admin/login?redirect=%2Fcrm" if role == "crm" else BASE + "/admin/login")
        pg.fill("input[name=email]", staff[role][0])
        pg.fill("input[name=password]", "fixture-password-123456")
        pg.locator("button[type=submit]").click()
        pg.wait_for_load_state("networkidle")
        pg.wait_for_timeout(1500)
        if role == "crm":
            check("CRM: login lands in /crm", "/crm" in pg.url, pg.url)
            pg.goto(BASE + "/admin")
            pg.wait_for_load_state("networkidle")
            check("CRM: /admin sends to /crm", "/crm" in pg.url and "/admin" not in pg.url, pg.url)
            check("CRM: home without Support tickets", pg.locator("section[aria-labelledby=today-tickets]").count() == 0 and pg.locator("h1").inner_text() == "Aujourd’hui")
            check("CRM: footer links to own account", pg.locator("a[href='/admin/account']").count() == 1)
            pg.goto(f"{BASE}/crm/documents/{draft}")
            body = pg.locator("main").inner_text()
            check("CRM: draft page without issuing actions", "réservés à un administrateur complet" in body and pg.locator("button", has_text="Envoyer").count() == 0, body[:200])
            pg.goto(f"{BASE}/crm/clients/{client_a}")
            check("CRM: company page without Support summary", "Support client" not in pg.locator("main").inner_text())
            pg.screenshot(path=f"{OUT}/profile-crm.png", full_page=True)
        else:
            body = pg.locator("body").inner_text()
            check("technician: dashboard shows tickets only", "Tickets à traiter" in body and "Demandes de contact" not in body and "Ouvrir le CRM" not in body, body[:300])
            nav = pg.locator("nav").first.inner_text()
            check("technician: menu without CRM or site content", "CRM clients" not in nav and "Pages" not in nav and "Médias" not in nav, nav[:300])
            pg.screenshot(path=f"{OUT}/profile-technician.png", full_page=True)
            check("technician: /crm refused", pg.goto(BASE + "/crm").status == 404)
        c.close()

    # Phone width: no page-level horizontal scroll.
    mobile = browser.new_context(viewport={"width": 390, "height": 844}, locale="fr-FR", storage_state=ctx.storage_state())
    m = mobile.new_page()
    m.on("pageerror", lambda e: errors.append(str(e)))
    m.goto(BASE + wa_page)
    m.locator(".crm-wa > button").click()
    width = m.evaluate("document.documentElement.scrollWidth")
    check("mobile 390px WhatsApp panel fits", width <= 390, str(width))
    m.screenshot(path=f"{OUT}/crm-mobile-whatsapp.png", full_page=True)
    preview = final_url.replace(BASE, "") + "/apercu"
    for path in ["/crm", "/crm/suivi", "/crm/opportunites", f"/crm/clients/{client_a}", wa_page, "/crm/clients", "/crm/taches", "/crm/clients/importer", preview]:
        m.goto(BASE + path)
        check(f"mobile page found {path}", m.locator("h1").count() == 1 and "404" not in m.locator("h1").inner_text())
        width = m.evaluate("document.documentElement.scrollWidth")
        check(f"mobile 390px no overflow {path}", width <= 390, str(width))
        m.screenshot(path=f"{OUT}/crm-mobile{path.replace('/', '-')}.png", full_page=True)
    check("no browser errors", not errors, "; ".join(errors)[:300])
    browser.close()

json.dump(results, open(f"{OUT}/crm-results.json", "w"), ensure_ascii=False, indent=1)
failed = [r for r in results if not r["ok"]]
print(f"{len(results) - len(failed)}/{len(results)} passed")
raise SystemExit(1 if failed else 0)
