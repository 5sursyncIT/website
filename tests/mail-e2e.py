# CRM ↔ contact@ in the browser, against the fake Graph (tests/mail-run.sh). Fixture
# accounts and addresses only (example.test); nothing reaches Microsoft.
import base64, json, re
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
GRAPH = "http://synmail-graph:8080"
OWNER, ASSISTANT, SENDER, PASSWORD = "admin@example.test", "assistante@example.test", "expediteur@example.test", "fixture-password-123456"
OUT = "/out"
results = []

def check(name, ok, detail=""):
    results.append({"check": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))

def submit(page, button):
    with page.expect_response(lambda r: r.request.method == "POST" and "/crm" in r.url, timeout=30000):
        button.click()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(300)

def flash(page):
    el = page.locator(".crm-flash")
    return " ".join(el.all_inner_texts())

def login(browser, email, viewport=(1440, 900)):
    ctx = browser.new_context(viewport={"width": viewport[0], "height": viewport[1]}, locale="fr-FR")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("dialog", lambda d: d.accept())
    page.goto(BASE + "/admin/login")
    page.fill("input[name=email]", email)
    page.fill("input[name=password]", PASSWORD)
    page.locator("button[type=submit]").click()
    page.wait_for_url("**/admin", timeout=30000)
    return ctx, page

errors = []
with sync_playwright() as p:
    api = p.request.new_context(base_url=BASE)
    graph = p.request.new_context(base_url=GRAPH)
    state = lambda: graph.post("/_control/state").json()
    token = api.post("/api/cms/admins/login", data={"email": OWNER, "password": PASSWORD}).json().get("token")
    H = {"Authorization": f"JWT {token}", "Origin": BASE}
    def create(collection, data):
        r = api.post(f"/api/cms/{collection}", headers=H, data=data)
        check(f"fixture {collection}", r.ok, str(r.status))
        return r.json()["doc"]["id"]
    alpha = create("clients", {"name": "Alpha Mail", "stage": "prospect", "email": "info@alpha.example.test"})
    awa = create("crm-contacts", {"name": "Awa Mail", "client": alpha, "email": "awa@alpha.example.test"})
    gamma = create("clients", {"name": "Gamma Mail", "stage": "prospect"})
    r = api.post("/api/cms/admins", headers=H, data={"email": ASSISTANT, "password": PASSWORD, "name": "Assistante Fixture", "mailAccess": "draft"})
    assistant_id = r.json().get("doc", {}).get("id") if r.ok else None
    check("owner creates the assistant with drafts only", r.ok and r.json()["doc"].get("mailAccess") == "draft", str(r.status))
    me_owner = api.get("/api/cms/admins/me", headers=H).json()["user"]
    owner_id = me_owner["id"]
    check("bootstrap administrator manages accounts", me_owner.get("manageAdmins") is True)
    r = api.post("/api/cms/admins", headers=H, data={"email": SENDER, "password": PASSWORD, "name": "Expéditeur Fixture", "mailAccess": "send"})
    sender_id = r.json().get("doc", {}).get("id") if r.ok else None
    check("owner creates a sender without account management", r.ok and r.json()["doc"].get("manageAdmins") in (False, None), str(r.status))
    def as_user(email):
        t = p.request.new_context(base_url=BASE).post("/api/cms/admins/login", data={"email": email, "password": PASSWORD}).json().get("token")
        return {"Authorization": f"JWT {t}", "Origin": BASE}
    def me(h):
        return p.request.new_context(base_url=BASE).get("/api/cms/admins/me", headers=h).json()["user"]
    fresh = lambda: p.request.new_context(base_url=BASE)
    SH = as_user(SENDER)
    fresh().patch(f"/api/cms/admins/{sender_id}", headers=SH, data={"manageAdmins": True, "mailAccess": "send"})
    check("sender cannot grant herself account management (direct API)", me(SH).get("manageAdmins") in (False, None))
    check("sender cannot modify another account", fresh().patch(f"/api/cms/admins/{assistant_id}", headers=SH, data={"name": "Pris"}).status in (401, 403))
    check("sender cannot create an account", fresh().post("/api/cms/admins", headers=SH, data={"email": "x@example.test", "password": PASSWORD, "name": "X"}).status in (401, 403))
    check("sender cannot delete an account", fresh().delete(f"/api/cms/admins/{assistant_id}", headers=SH).status in (401, 403))
    fresh().patch(f"/api/cms/admins/{owner_id}", headers=H, data={"mailAccess": "read", "manageAdmins": False})
    mo = me(H)
    check("account manager cannot change her own rights either", mo.get("mailAccess") == "send" and mo.get("manageAdmins") is True, str(mo))
    r = fresh().patch(f"/api/cms/admins/{assistant_id}", headers=H, data={"mailAccess": "read"})
    ok_change = r.ok and r.json()["doc"]["mailAccess"] == "read"
    fresh().patch(f"/api/cms/admins/{assistant_id}", headers=H, data={"mailAccess": "draft"})
    check("account manager sets another account's right", ok_change and me(as_user(ASSISTANT)).get("mailAccess") == "draft")

    pdf = base64.b64encode(b"%PDF-1.4 fixture").decode()
    graph.post("/_control/add", data={"folder": "inbox", "subject": "Demande Awa", "from": "awa@alpha.example.test", "fromName": "Awa", "to": ["contact@5sursync.com"],
        "body": "<p>Bonjour, voici notre cahier des charges.</p>",
        "attachments": [{"id": "att-cdc", "name": "cahier des charges.pdf", "contentType": "application/pdf", "contentBytes": pdf, "isInline": False}]})
    graph.post("/_control/add", data={"folder": "inbox", "subject": "Message inconnu", "from": "qui@inconnu.example.test", "to": ["contact@5sursync.com"],
        "body": "<p onclick=\"steal()\">Texte visible</p><script>steal()</script><img src=\"https://track.example/p.gif\">"})

    browser = p.chromium.launch()
    ctx, page = login(browser, OWNER)
    page.goto(BASE + "/crm/messagerie?vue=etat")
    submit(page, page.locator("button", has_text="Synchroniser maintenant"))
    check("manual synchronisation", "Synchronisation" in flash(page) and "erreur" not in flash(page), flash(page))
    body = page.locator("main").inner_text()
    check("status page: mailbox, 90 days, acceptance list, certificates", "contact@5sursync.com" in body and "90 jours" in body and "liste de recette" in body and "Certificat" in body)
    page.screenshot(path=f"{OUT}/mail-status.png", full_page=True)

    page.goto(BASE + f"/crm/clients/{alpha}")
    card = page.locator(".crm-card", has_text="Emails contact@")
    check("company page lists the exchange", "Demande Awa" in card.inner_text())
    page.screenshot(path=f"{OUT}/mail-company.png", full_page=True)
    page.goto(BASE + f"/crm/contacts/{awa}")
    check("contact page lists the exchange", "Demande Awa" in page.locator(".crm-card", has_text="Emails contact@").inner_text())

    page.goto(BASE + "/crm/messagerie")
    check("unknown sender waits in « À attribuer »", "Message inconnu" in page.locator("main").inner_text() and "Demande Awa" not in page.locator("main").inner_text())
    page.locator("a", has_text="Message inconnu").click()
    page.wait_for_load_state("networkidle")
    msg_url = page.url
    text = page.locator(".crm-mail-body").inner_text()
    check("message read as plain text from Microsoft", "Texte visible" in text and "<script" not in page.content().split("crm-mail-body")[1][:500], text[:80])
    mid = re.search(r"/crm/messagerie/(\d+)", msg_url).group(1)
    h = ctx.request.get(BASE + f"/crm/messagerie/{mid}/html")
    csp = h.headers.get("content-security-policy", "")
    check("formatted version: CSP sandbox, no script, no remote image", h.status == 200 and csp.startswith("sandbox") and "img-src data:" in csp and "<script" not in h.text() and "onclick" not in h.text(), csp)
    anon = p.request.new_context(base_url=BASE)
    r = anon.get(f"/crm/messagerie/{mid}/html", max_redirects=0)
    check("formatted version refused without session", r.status in (302, 303, 307, 404) and "Texte visible" not in r.text(), str(r.status))
    r = anon.get(f"/crm/messagerie/{mid}", max_redirects=0)
    check("message page refused without session", r.status in (302, 303, 307) and "/admin/login" in r.headers.get("location", ""), str(r.status))
    page.select_option("select[name=client]", str(gamma))
    submit(page, page.locator("button", has_text="Rattacher"))
    check("manual attribution", "Message rattaché" in flash(page), flash(page))
    page.goto(BASE + f"/crm/clients/{gamma}")
    check("attributed message on the chosen company", "Message inconnu" in page.locator(".crm-card", has_text="Emails contact@").inner_text())

    page.goto(BASE + f"/crm/clients/{alpha}")
    page.locator(".crm-card", has_text="Emails contact@").locator("a", has_text="Demande Awa").click()
    page.wait_for_load_state("networkidle")
    att = page.locator("a", has_text="cahier des charges.pdf")
    dl = ctx.request.get(BASE + att.get_attribute("href"))
    check("attachment downloaded through the CRM, never rendered", dl.status == 200 and dl.headers.get("content-type") == "application/octet-stream" and dl.headers.get("content-disposition", "").startswith("attachment") and dl.body().startswith(b"%PDF"), str(dl.headers.get("content-disposition")))
    page.fill("textarea[name=text]", "Merci Awa, nous revenons vers vous.")
    submit(page, page.locator("button", has_text="Préparer la réponse"))
    check("reply prepared as a draft", "Rien n’a été envoyé" in flash(page) and "Réponse dans le fil" in page.locator("main").inner_text(), flash(page))
    reply_url = page.url
    s = state()
    check("draft in contact@, nothing sent", any(d["subject"] == "RE: Demande Awa" for d in s["drafts"]) and not s["sends"])

    page.goto(BASE + f"/crm/clients/{alpha}")
    page.locator("a", has_text="Nouveau mail").click()
    page.wait_for_load_state("networkidle")
    check("new mail prefilled with the company address", page.input_value("input[name=to]") == "info@alpha.example.test")
    page.fill("input[name=to]", "test@example.test")
    page.fill("input[name=subject]", "Recette contact@")
    page.fill("textarea[name=text]", "Message de recette.\nDeuxième ligne.")
    submit(page, page.locator("button", has_text="Enregistrer le brouillon"))
    draft_url = page.url
    check("new draft saved", "/crm/messagerie/brouillons/" in draft_url and "Rien n’a été envoyé" in flash(page), flash(page))
    page.screenshot(path=f"{OUT}/mail-draft.png", full_page=True)
    s = state()
    d = next(x for x in s["drafts"] if x["subject"] == "Recette contact@")
    check("signature once with the logo, text escaped", d["body"].count("sync5-signature") == 2 and "sync5-logo" in d["attachments"] and "Deuxième ligne" in d["body"] and not s["sends"])

    # Assistant: drafts only.
    actx, apage = login(browser, ASSISTANT)
    apage.goto(draft_url)
    check("assistant: no send button", apage.locator("button", has_text="Envoyer").count() == 0 and "réservé aux administrateurs autorisés" in apage.locator("main").inner_text())
    submit(apage, apage.locator("button", has_text="Signaler pour validation"))
    check("assistant signals the draft for validation", "validation" in flash(apage), flash(apage))
    atoken = api.post("/api/cms/admins/login", data={"email": ASSISTANT, "password": PASSWORD}).json().get("token")
    AH = {"Authorization": f"JWT {atoken}", "Origin": BASE}
    fresh().patch(f"/api/cms/admins/{assistant_id}", headers=AH, data={"mailAccess": "send", "manageAdmins": True})
    ma = me(AH)
    check("assistant cannot raise her own rights (direct API)", ma.get("mailAccess") == "draft" and ma.get("manageAdmins") in (False, None), str(ma.get("mailAccess")))
    r = fresh().patch(f"/api/cms/admins/{owner_id}", headers=AH, data={"name": "Pris"})
    check("assistant cannot modify the owner's account", r.status in (401, 403), str(r.status))
    check("assistant cannot create an account", fresh().post("/api/cms/admins", headers=AH, data={"email": "y@example.test", "password": PASSWORD, "name": "Y"}).status in (401, 403))
    apage.goto(BASE + "/crm/messagerie?vue=brouillons")
    check("drafts to validate listed", "Recette contact@" in apage.locator("main").inner_text())
    actx.close()

    # Owner: explicit send, acceptance list.
    page.goto(reply_url)
    page.check("input[name=confirm]")
    submit(page, page.locator("button", has_text="Envoyer"))
    check("recipient outside the acceptance list refused", "hors de la liste de recette" in flash(page) and not state()["sends"], flash(page))
    page.goto(draft_url)
    page.check("input[name=confirm]")
    submit(page, page.locator("button", has_text="Envoyer"))
    check("send: « Accepté par Microsoft », not a proof of receipt", "Accepté par Microsoft" in flash(page) and "pas une preuve de réception" in flash(page), flash(page))
    s = state()
    check("exactly one message left, to the test address", len(s["sends"]) == 1 and s["sends"][0]["to"] == ["test@example.test"], json.dumps(s["sends"]))
    page.goto(BASE + "/crm/messagerie?vue=etat")
    submit(page, page.locator("button", has_text="Synchroniser maintenant"))
    page.goto(draft_url)
    main = page.locator("main").inner_text()
    check("then « Présent dans les Éléments envoyés »", "Présent dans les Éléments envoyés" in main, main[:200])
    check("journal: prepared by…, sent by…", "Propriétaire Fixture" in main and "envoi demandé" in main and "accepté par Microsoft" in main)
    check("no send button once sent", page.locator("button", has_text="Envoyer").count() == 0)
    check("sent message text read back from Sent Items", "Deuxième ligne" in main)
    page.screenshot(path=f"{OUT}/mail-sent.png", full_page=True)

    mctx = browser.new_context(viewport={"width": 390, "height": 844}, locale="fr-FR", storage_state=ctx.storage_state())
    m = mctx.new_page()
    m.on("pageerror", lambda e: errors.append(str(e)))
    for path in ["/crm/messagerie", "/crm/messagerie?vue=etat", msg_url.replace(BASE, ""), draft_url.replace(BASE, ""), f"/crm/clients/{alpha}"]:
        m.goto(BASE + path)
        w = m.evaluate("document.documentElement.scrollWidth")
        check(f"mobile 390px no overflow {path}", w <= 390, str(w))
    m.screenshot(path=f"{OUT}/mail-mobile-draft.png", full_page=True)
    check("no browser errors", not errors, "; ".join(errors)[:300])
    browser.close()

json.dump(results, open(f"{OUT}/mail-results.json", "w"), ensure_ascii=False, indent=1)
failed = [r for r in results if not r["ok"]]
print(f"{len(results) - len(failed)}/{len(results)} passed")
raise SystemExit(1 if failed else 0)
