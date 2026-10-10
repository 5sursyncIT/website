# Boundary checks for the six-improvements audit (10 October 2026): the cases the existing
# 172 browser checks do not cover — more than 30 website requests, more than 50 activities,
# real ticket urgency, a company left without a next action through the API, the service
# context of the contact form, the indicators page and the system state page.
# Throwaway stack only (tests/crm-limits-run.sh): fixture accounts, *_test database.
import json
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
    api.post("/api/cms/admins/first-register", data={"email": EMAIL, "password": PASSWORD, "name": "Admin Fixture"})
    token = api.post("/api/cms/admins/login", data={"email": EMAIL, "password": PASSWORD}).json().get("token")
    H = {"Authorization": f"JWT {token}", "Origin": BASE}

    def create(collection, data):
        r = api.post(f"/api/cms/{collection}", headers=H, data=data)
        assert r.status in (200, 201), f"{collection}: {r.status} {r.text()[:300]}"
        return r.json().get("doc", {})

    # ---------- 1. More than 30 website requests, the recent ones all converted ----------
    # The home page used to read the last 30 then drop the converted ones, so the oldest
    # untreated request disappeared behind a wall of recent, already converted ones.
    company = create("clients", {"name": "Entreprise Limites", "stage": "prospect", "pipeline": "to-contact"})
    requests_made = []
    # The public endpoint allows 5 requests per IP per window, so each fixture request
    # comes from its own client IP: the real route is exercised, not bypassed.
    for i in range(34):
        r = api.post("/api/contact", headers={"Origin": BASE, "X-Real-Ip": f"10.9.0.{i + 1}"}, data={
            "name": f"Visiteur {i:02d}", "company": f"Demande {i:02d}", "email": f"v{i:02d}@example.test",
            "phone": "770000000", "topic": "reseaux-cloud", "message": f"Besoin numero {i:02d}, deux sites.", "website": ""})
        assert r.status == 201, f"contact {i}: {r.status}"
    listed = api.get("/api/cms/contact-requests?limit=100&sort=createdAt", headers=H).json().get("docs", [])
    requests_made = [d["id"] for d in listed]
    check("fixture: 34 demandes enregistrees", len(requests_made) == 34, str(len(requests_made)))
    # Convert every request except the two oldest: the conversion activity marks it treated.
    for rid in requests_made[2:]:
        create("crm-activities", {"kind": "note", "subject": f"Conversion {rid}", "client": company["id"],
                                  "request": rid, "done": True})
    untreated = requests_made[:2]

    # ---------- 2. More than 50 activities, with one old open dated action ----------
    old_action = create("crm-activities", {
        "kind": "call", "subject": "Rappeler la direction (action ancienne)", "client": company["id"],
        "dueAt": "2026-09-01T09:00:00.000Z", "done": False})
    for i in range(60):
        create("crm-activities", {"kind": "note", "subject": f"Echange {i:02d}", "client": company["id"], "done": True})

    # ---------- 3. Tickets: real urgency and who owes an answer ----------
    account = create("client-accounts", {"email": "client@example.test", "password": "fixture-password-123456",
                                         "client": company["id"], "name": "Contact Client"})
    def ticket(subject, priority, status="open"):
        return create("tickets", {"subject": subject, "category": "reseaux-cloud", "description": "Description de test.",
                                  "status": status, "priority": priority, "client": company["id"],
                                  "author": {"relationTo": "client-accounts", "value": account["id"]}})
    t_urgent = ticket("Panne totale du lien principal", "urgent")
    t_normal = ticket("Question de facturation", "normal")
    t_answered = ticket("Demande deja traitee", "high")
    # The team answered the last one; nobody answered the other two.
    create("ticket-replies", {"ticket": t_answered["id"], "message": "Reponse de l equipe.",
                              "client": company["id"], "author": {"relationTo": "admins", "value": 1}})

    # ---------- 4. A company left active without a next action, through the API ----------
    orphan = create("clients", {"name": "Entreprise Sans Action", "stage": "prospect", "pipeline": "meeting"})

    # ---------- 5. Contact form service context ----------
    r = api.post("/api/contact", headers={"Origin": BASE, "X-Real-Ip": "10.9.1.1"}, data={
        "name": "Visiteur Service", "company": "Societe Service", "email": "service@example.test",
        "phone": "770000001", "topic": "solutions-metier", "message": "Nous avons lu la page solutions metier.",
        "service": "solutions-metier", "website": ""})
    check("demande avec contexte de service acceptee", r.status == 201, f"{r.status} {r.text()[:200]}")
    r = api.post("/api/contact", headers={"Origin": BASE, "X-Real-Ip": "10.9.1.2"}, data={
        "name": "Visiteur Triche", "company": "X", "email": "triche@example.test", "phone": "", "topic": "autre",
        "message": "Service invente, doit etre refuse.", "service": "page-inventee", "website": ""})
    check("service inconnu refuse par le schema", r.status == 400, str(r.status))
    stored = api.get("/api/cms/contact-requests?limit=100&where[service][equals]=solutions-metier", headers=H).json()
    check("service consulte enregistre avec la demande", stored.get("totalDocs") == 1, str(stored.get("totalDocs")))

    # ---------- 6. Besoins et services demandés (point 3 de l'audit) ----------
    besoins = create("clients", {"name": "Entreprise Besoins", "stage": "prospect", "pipeline": "engaged",
                                 "needs": ["reseaux-cloud", "maintenance-support"],
                                 "needsDetail": "Deux sites à relier, supervision 24/7 souhaitée."})
    # Une demande convertie reporte le sujet choisi par le visiteur dans les besoins.
    r = api.post("/api/contact", headers={"Origin": BASE, "X-Real-Ip": "10.9.2.1"}, data={
        "name": "Visiteur Besoin", "company": "Entreprise Besoins", "email": "besoin@example.test",
        "phone": "770000002", "topic": "developpement-api", "message": "Nous voudrions une API interne.",
        "website": ""})
    check("demande a convertir enregistree", r.status == 201, str(r.status))
    a_convertir = api.get("/api/cms/contact-requests?limit=1&sort=-createdAt", headers=H).json()["docs"][0]

    # ---------- Browser checks ----------
    browser = p.chromium.launch()
    errors = []
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="fr-FR")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE + "/admin/login")
    page.fill("input[name=email]", EMAIL)
    page.fill("input[name=password]", PASSWORD)
    page.locator("button[type=submit]").click()
    page.wait_for_url("**/admin", timeout=30000)

    # 1. Home: the two old untreated requests are counted and shown.
    page.goto(BASE + "/crm")
    page.wait_for_load_state("networkidle")
    # Expected number of untreated requests, read from the data itself.
    all_requests = api.get("/api/cms/contact-requests?limit=0", headers=H).json().get("totalDocs")
    conv = api.get("/api/cms/crm-activities?limit=0&where[request][exists]=true", headers=H).json().get("totalDocs")
    expected = all_requests - conv
    check("fixture: plus d une page de 30 demandes, dont des anciennes non traitees",
          all_requests > 30 and expected >= 2, f"{all_requests} demandes, {conv} converties, {expected} en attente")
    card = page.locator("section[aria-labelledby=today-requests]")
    text = card.inner_text()
    check("accueil: demandes anciennes non traitees visibles au-dela de 30",
          "Aucune demande non traitée" not in text, text[:200])
    check("accueil: compteur des demandes non traitees egal au compte reel",
          card.locator(".crm-count").first.inner_text().strip() == str(expected),
          f"affiche {card.locator('.crm-count').first.inner_text()}, attendu {expected}")
    check("accueil: la plus ancienne demande est nommee", "Demande 00" in text, text[:200])
    page.screenshot(path=f"{OUT}/limits-accueil.png", full_page=True)

    # /crm/demandes: global filter, real total.
    page.goto(BASE + "/crm/demandes")
    page.wait_for_load_state("networkidle")
    tabs = page.locator("nav[aria-label=Filtre]").inner_text()
    body = page.locator("body").inner_text()
    check("demandes: onglet A traiter affiche le total global", f"À traiter ({expected})" in tabs, tabs[:120])
    check("demandes: aucune mention 'sur cette page'", "sur cette page" not in body)

    # 2. Company page: the old open action is the next action.
    page.goto(BASE + f"/crm/clients/{company['id']}")
    page.wait_for_load_state("networkidle")
    nxt = page.locator("section.crm-next").inner_text()
    check("fiche: prochaine action trouvee au-dela des 50 activites recentes",
          "Rappeler la direction" in nxt and "Aucune action prévue" not in nxt, nxt[:250])
    check("fiche: historique pagine", page.locator("nav.crm-pager").count() == 1)
    page.screenshot(path=f"{OUT}/limits-fiche.png", full_page=True)
    page.goto(BASE + f"/crm/clients/{company['id']}?page=2")
    page.wait_for_load_state("networkidle")
    check("fiche: page 2 de l historique accessible",
          "Page 2" in page.locator("nav.crm-pager").inner_text(), page.locator("nav.crm-pager").inner_text())

    # 3. Tickets: urgency first, honest wait label.
    page.goto(BASE + "/crm")
    page.wait_for_load_state("networkidle")
    tickets_card = page.locator("section[aria-labelledby=today-tickets]")
    items = tickets_card.locator("li")
    first = items.first.inner_text()
    whole = tickets_card.inner_text()
    check("accueil: ticket urgent en tete", "Panne totale" in first, first[:200])
    check("accueil: priorite affichee", "Priorité urgente" in whole, whole[:300])
    check("accueil: 'jamais repondu' pour un ticket sans reponse equipe", "jamais répondu" in whole, whole[:300])
    check("accueil: ticket repondu signale comme repondu",
          "répondu le" in whole and "2 en attente" in whole, whole[:300])
    check("accueil: plus de libelle base sur updatedAt", "mis à jour le" not in whole, whole[:300])

    # 4. Company without a next action, created through the API.
    unplanned = page.locator("section[aria-labelledby=today-unplanned]").inner_text()
    check("accueil: entreprise sans action creee par API signalee",
          "Entreprise Sans Action" in unplanned, unplanned[:250])
    page.goto(BASE + "/crm/suivi")
    page.wait_for_load_state("networkidle")
    board = page.locator("body").inner_text()
    check("tableau: carte sans action marquee", "Aucune action prévue" in board)
    check("tableau: compteur sans prochaine action dans l entete", "sans prochaine action" in board)

    # 5. Public pages: contextualised CTA, preselected need, relevant case studies.
    pub = ctx.new_page()
    pub.on("pageerror", lambda e: errors.append(str(e)))
    for slug in ("reseaux-cloud", "solutions-metier", "developpement-api", "maintenance-support"):
        pub.goto(f"{BASE}/{slug}")
        pub.wait_for_load_state("networkidle")
        hrefs = pub.locator(f"a[href='/contact?service={slug}']").count()
        check(f"service {slug}: CTA porte le contexte", hrefs >= 1, str(hrefs))
        cases = pub.locator("section[aria-labelledby=realisations-service] article").count()
        check(f"service {slug}: realisations pertinentes affichees", cases >= 2, str(cases))
        pub.screenshot(path=f"{OUT}/limits-service-{slug}.png", full_page=True)
    pub.goto(f"{BASE}/contact?service=solutions-metier")
    pub.wait_for_load_state("networkidle")
    check("contact: sujet preselectionne depuis la page service",
          pub.locator("select[name=topic]").input_value() == "solutions-metier",
          pub.locator("select[name=topic]").input_value())
    check("contact: contexte de service rappele au visiteur",
          "Solutions métier" in pub.locator("form").first.inner_text() or "Solutions métier" in pub.locator("body").inner_text())
    check("contact: champ service transmis au formulaire",
          pub.locator("input[name=service]").count() == 1)
    pub.goto(f"{BASE}/contact?service=page-inventee")
    pub.wait_for_load_state("networkidle")
    check("contact: service inconnu ignore (pas de preselection)",
          pub.locator("select[name=topic]").input_value() == "" and pub.locator("input[name=service]").count() == 0)
    pub.goto(f"{BASE}/en/networks-cloud")
    pub.wait_for_load_state("networkidle")
    check("service EN: CTA vers /en/contact avec contexte",
          pub.locator("a[href='/en/contact?service=reseaux-cloud']").count() >= 1)

    # Besoins : affichés sur la fiche, et complétés par une conversion de demande.
    page.goto(BASE + f"/crm/clients/{besoins['id']}")
    page.wait_for_load_state("networkidle")
    fiche = page.locator("section.crm-next").inner_text()
    check("fiche: besoins declares affiches",
          "Réseaux et cloud" in fiche and "Maintenance et support" in fiche, fiche[:300])
    check("fiche: detail du besoin affiche", "Deux sites à relier" in fiche, fiche[:300])
    page.goto(BASE + f"/crm/clients/{company['id']}")
    page.wait_for_load_state("networkidle")
    check("fiche: absence de besoin signalee",
          "Aucun besoin renseigné" in page.locator("section.crm-next").inner_text())
    # Conversion de la demande sur l'entreprise existante : le sujet devient un besoin.
    page.goto(BASE + "/crm/demandes")
    page.wait_for_load_state("networkidle")
    carte = page.locator(f"article#demande-{a_convertir['id']}")
    carte.locator("select[name=client]").select_option(str(besoins["id"]))
    with page.expect_response(lambda r: r.request.method == "POST" and "/crm" in r.url, timeout=30000):
        carte.locator("button[type=submit]").click()
    page.wait_for_load_state("networkidle")
    apres = api.get(f"/api/cms/clients/{besoins['id']}", headers=H).json().get("needs", [])
    check("conversion: le sujet de la demande rejoint les besoins",
          "developpement-api" in apres and "reseaux-cloud" in apres, str(apres))

    # 6. Indicators page: definitions, period and computed values.
    page.goto(BASE + "/crm/rapports")
    page.wait_for_load_state("networkidle")
    rep = page.locator("body").inner_text()
    check("indicateurs: page accessible", page.locator("h1").inner_text().strip() == "Indicateurs commerciaux")
    for label in ("Entreprises contactées", "Taux de réponse", "Rendez-vous réalisés", "Devis envoyés", "Entreprises perdues"):
        check(f"indicateurs: {label} present", label in rep)
    check("indicateurs: denominateur explicite", "Dénominateur" in rep)
    check("indicateurs: limite du taux de reponse enoncee", "historique des changements d’étape n’est pas conservé" in rep)
    check("indicateurs: periode affichee", "Période :" in rep)
    check("indicateurs: besoins declares sur les fiches", "besoins déclarés sur les fiches" in rep.lower(), rep[-500:])
    check("indicateurs: services demandes par page consultee",
          "page de service consultée" in rep.lower(), rep[-400:])
    page.screenshot(path=f"{OUT}/limits-rapports.png", full_page=True)
    page.goto(BASE + "/crm/rapports?periode=mois")
    page.wait_for_load_state("networkidle")
    check("indicateurs: changement de periode", "Ce mois" in page.locator("nav[aria-label=Période]").inner_text())

    # 7. System state: honest about an untested restore, reads recorded events.
    page.goto(BASE + "/crm/systeme")
    page.wait_for_load_state("networkidle")
    sysbody = page.locator("body").inner_text()
    check("systeme: page accessible", page.locator("h1").inner_text().strip() == "État du système")
    check("systeme: restauration jamais testee annoncee comme telle",
          "Jamais testée" in sysbody or "Non mesurée" in sysbody, sysbody[:400])
    check("systeme: demandes non traitees supervisees", "Demandes du site non traitées" in sysbody)
    check("systeme: tickets sans reponse supervises", "Tickets sans réponse de l’équipe" in sysbody)
    check("systeme: sauvegarde supervisee", "Dernière sauvegarde" in sysbody)
    check("systeme: la plus ancienne demande datee", "La plus ancienne" in sysbody)
    page.screenshot(path=f"{OUT}/limits-systeme.png", full_page=True)

    # Support: an administrator is told to use the administration instead of a doomed form.
    page.goto(BASE + "/support/nouveau")
    page.wait_for_load_state("networkidle")
    sup = page.locator("body").inner_text()
    check("support: pas de formulaire voue a l echec pour un admin",
          page.locator("textarea[name=description]").count() == 0, sup[:200])
    check("support: admin dirige vers l administration",
          "administration" in sup.lower() and page.locator("a[href='/admin/collections/tickets/create']").count() >= 1,
          sup[:300])
    page.goto(BASE + "/support")
    page.wait_for_load_state("networkidle")
    check("support: bouton d ouverture adapte a l admin",
          page.locator("a[href='/support/nouveau']").count() == 0
          and page.locator("a[href='/admin/collections/tickets/create']").count() >= 1)

    check("aucune erreur navigateur", not errors, "; ".join(errors)[:300])
    browser.close()

json.dump(results, open(f"{OUT}/crm-limits-results.json", "w"), ensure_ascii=False, indent=1)
failed = [r for r in results if not r["ok"]]
print(f"{len(results) - len(failed)}/{len(results)} passed")
raise SystemExit(1 if failed else 0)
