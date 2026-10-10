# CRM ↔ Simafri mailbox (SMTP/IMAP) in the browser, against Dovecot and the fake SMTP server
# (tests/mail-imap-run.sh). Fixture accounts and addresses only (example.test); no mail leaves.
import base64, email, imaplib, ssl
from email import policy
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
SMTP = "http://synimap-smtp:8025"
OWNER, ASSISTANT, PASSWORD = "admin@example.test", "assistante@example.test", "fixture-password-123456"
BOX, BOX_PW = "contact@crm.example.test", open("/certs/pw").read().strip()
DRAFTS, SENT = '"Brouillons perso"', '"Messages envoy&AOk-s"'
OUT = "/out"
results, errors = [], []

def check(name, ok, detail=""):
    results.append({"check": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))

def submit(page, button):
    with page.expect_response(lambda r: r.request.method == "POST" and "/crm" in r.url, timeout=60000):
        button.click()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(300)

def flash(page):
    return " ".join(page.locator(".crm-flash").all_inner_texts())

def login(browser, user, viewport=(1440, 900)):
    ctx = browser.new_context(viewport={"width": viewport[0], "height": viewport[1]}, locale="fr-FR")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("dialog", lambda d: d.accept())
    page.goto(BASE + "/admin/login")
    page.fill("input[name=email]", user)
    page.fill("input[name=password]", PASSWORD)
    page.locator("button[type=submit]").click()
    page.wait_for_url("**/admin", timeout=30000)
    return ctx, page

def imap():
    m = imaplib.IMAP4_SSL("imap.test", 993, ssl_context=ssl.create_default_context(cafile="/certs/ca.crt"))
    m.login(BOX, BOX_PW)
    return m

def messages(folder, subject):
    m = imap()
    try:
        m.select(folder, readonly=True)
        _, data = m.search(None, "SUBJECT", f'"{subject}"')
        out = []
        for num in data[0].split():
            _, parts = m.fetch(num, "(FLAGS BODY.PEEK[])")
            out.append((parts[0][0].decode(), email.message_from_bytes(parts[0][1], policy=policy.default)))
        return out
    finally:
        m.logout()

def html_of(msg):
    part = msg.get_body(preferencelist=("html",))
    return part.get_content() if part else ""

def files_of(msg):
    return sorted(p.get_filename() for p in msg.iter_attachments() if p.get_content_disposition() == "attachment")

with sync_playwright() as p:
    api = p.request.new_context(base_url=BASE)
    smtp = p.request.new_context(base_url=SMTP)
    sent = lambda: smtp.get("/").json()["received"]
    token = api.post("/api/cms/admins/login", data={"email": OWNER, "password": PASSWORD}).json().get("token")
    H = {"Authorization": f"JWT {token}", "Origin": BASE}
    def create(collection, data):
        r = api.post(f"/api/cms/{collection}", headers=H, data=data)
        check(f"fixture {collection}", r.ok, str(r.status))
        return r.json()["doc"]["id"]
    alpha = create("clients", {"name": "Alpha Simafri", "stage": "prospect", "email": "info@alpha.example.test"})
    awa = create("crm-contacts", {"name": "Awa Simafri", "client": alpha, "email": "awa@alpha.example.test"})
    r = api.post("/api/cms/admins", headers=H, data={"email": ASSISTANT, "password": PASSWORD, "name": "Assistante Fixture", "mailAccess": "draft"})
    check("assistant with drafts only", r.ok, str(r.status))

    # Incoming message, as the outside world would deliver it.
    m = imap()
    m.append("INBOX", None, None, ("From: Awa <awa@alpha.example.test>\r\nTo: " + BOX + "\r\nSubject: Demande Awa Simafri\r\n"
        "Message-ID: <e2e-awa@alpha.example.test>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nBonjour, texte visible.\r\n").encode())
    m.logout()

    browser = p.chromium.launch()
    ctx, page = login(browser, OWNER)
    page.goto(BASE + "/crm/messagerie?vue=etat")
    body = page.locator("main").inner_text()
    check("status page: Simafri mailbox, STARTTLS, verified certificates, secret never shown",
          BOX in body and "STARTTLS obligatoire" in body and "certificat vérifié" in body and "fichier secret" in body and BOX_PW not in page.content(), body[:200])
    submit(page, page.locator("button", has_text="Synchroniser maintenant"))
    check("manual synchronisation", "Synchronisation" in flash(page) and "erreur" not in flash(page), flash(page))
    body = page.locator("main").inner_text()
    check("folders shown by their server paths", "INBOX" in body and "Messages envoyés" in body, body[:400])

    page.goto(BASE + f"/crm/clients/{alpha}")
    card = page.locator(".crm-card", has_text="Emails " + BOX)
    check("company card lists the received message", "Demande Awa Simafri" in card.inner_text())
    card.locator("a", has_text="Demande Awa Simafri").click()
    page.wait_for_load_state("networkidle")
    check("message read as plain text", "texte visible" in page.locator(".crm-mail-body").inner_text())
    _, inbox = messages("INBOX", "Demande Awa Simafri")[0]
    check("reading in the CRM left it unread", "\\Seen" not in messages("INBOX", "Demande Awa Simafri")[0][0])
    page.fill("textarea[name=text]", "Merci, voici notre offre.")
    page.set_input_files("input[name=files]", files=[{"name": "offre.pdf", "mimeType": "application/pdf", "buffer": b"%PDF-1.4\n% e2e\n"}])
    submit(page, page.locator("button", has_text="Préparer la réponse"))
    check("reply prepared as a draft, nothing sent", "Réponse préparée" in flash(page) and not sent(), flash(page))
    reply_url = page.url.split("?")[0]
    drafts = messages(DRAFTS, "RE: Demande Awa Simafri")
    flags, msg = drafts[0] if drafts else ("", None)
    check("reply in the Drafts folder, \\Draft flag, thread headers", msg is not None and "\\Draft" in flags and msg["In-Reply-To"] == "<e2e-awa@alpha.example.test>", flags)
    check("reply: one signature, one logo, attachment", msg is not None and html_of(msg).count("sync5-signature") == 2 and html_of(msg).count("cid:sync5-logo") == 1 and files_of(msg) == ["offre.pdf"])
    check("draft page lists the attachment", "offre.pdf" in page.locator("main").inner_text())

    # Assistant: new message with attachments, edit, no send.
    actx, apage = login(browser, ASSISTANT)
    apage.goto(BASE + f"/crm/messagerie/nouveau?entreprise={alpha}&contact={awa}")
    check("sender shown: L’équipe 5/Sync IT <contact@…>", f"L’équipe 5/Sync IT <{BOX}>" in apage.locator("input[disabled]").first.input_value())
    apage.fill("input[name=subject]", "[E2E] Proposition Simafri")
    apage.fill("textarea[name=text]", "Bonjour Awa,\nNotre proposition.")
    apage.set_input_files("input[name=files]", files=[{"name": "devis.pdf", "mimeType": "application/pdf", "buffer": b"%PDF-1.4\n"},
                                                       {"name": "annexe.txt", "mimeType": "text/plain", "buffer": b"annexe"}])
    submit(apage, apage.locator("button", has_text="Enregistrer le brouillon"))
    check("new draft saved", "Brouillon enregistré" in flash(apage), flash(apage))
    draft_url = apage.url.split("?")[0]
    msg = messages(DRAFTS, "[E2E] Proposition Simafri")[0][1]
    check("draft in the mailbox with both attachments", files_of(msg) == ["annexe.txt", "devis.pdf"], str(files_of(msg)))
    check("assistant: no send form", apage.locator("form.crm-send").count() == 0 and "réservé" in apage.locator("main").inner_text())
    apage.locator("input[name=remove][value='annexe.txt']").check()
    apage.fill("textarea[name=text]", "Bonjour Awa,\nNotre proposition corrigée.")
    submit(apage, apage.locator("button", has_text="Enregistrer le brouillon"))
    found = messages(DRAFTS, "[E2E] Proposition Simafri")
    check("re-saved: one draft in the mailbox, attachment removed, text replaced",
          len(found) == 1 and files_of(found[0][1]) == ["devis.pdf"] and "corrigée" in html_of(found[0][1]), str(len(found)))
    apage.set_input_files("input[name=files]", files=[{"name": "outil.exe", "mimeType": "application/octet-stream", "buffer": b"MZ"}])
    submit(apage, apage.locator("button", has_text="Enregistrer le brouillon"))
    check("executable attachment refused", "Type de fichier refusé" in flash(apage), flash(apage))
    submit(apage, apage.locator("button", has_text="Signaler pour validation"))
    check("submitted for validation", "signalé" in flash(apage).lower(), flash(apage))

    # Owner sends after explicit confirmation.
    page.goto(draft_url)
    page.locator("form.crm-send input[name=confirm]").check()
    submit(page, page.locator("form.crm-send button", has_text="Envoyer"))
    check("send: accepted by SMTP, copy in Sent, not a proof of receipt", "Accepté, copie dans Envoyés" in flash(page) and "pas une preuve de réception" in flash(page), flash(page))
    received = sent()
    check("exactly one SMTP message, from the mailbox, to the recipient", len(received) == 1 and received[0]["from"] == BOX and received[0]["to"] == ["awa@alpha.example.test"], str([(r["from"], r["to"]) for r in received]))
    wire = email.message_from_bytes(base64.b64decode(received[0]["raw"]), policy=policy.default) if received else None
    check("sent bytes: one signature, one logo, the attachment", wire is not None and html_of(wire).count("sync5-signature") == 2 and files_of(wire) == ["devis.pdf"])
    check("one copy in Sent, none left in Drafts", len(messages(SENT, "[E2E] Proposition Simafri")) == 1 and not messages(DRAFTS, "[E2E] Proposition Simafri"))
    main = page.locator("main").inner_text()
    check("journal: prepared by the assistant, accepted by SMTP, copy saved", "Assistante Fixture" in main and "accepté par le serveur SMTP" in main and "copie enregistrée dans Envoyés" in main)
    check("no send form any more (no second send)", page.locator("form.crm-send").count() == 0)
    page.goto(BASE + "/crm/messagerie?vue=envois")
    check("« Envois » tab shows the SMTP state", "Accepté, copie dans Envoyés" in page.locator("main").inner_text())
    page.goto(reply_url)
    check("reply draft still a draft (nothing sent by other actions)", "Brouillon" in page.locator("main").inner_text() and len(sent()) == 1)
    mctx = browser.new_context(viewport={"width": 390, "height": 844}, locale="fr-FR")
    mctx.add_cookies(ctx.cookies())
    mp = mctx.new_page()
    for path in ["/crm/messagerie?vue=etat", draft_url.replace(BASE, ""), reply_url.replace(BASE, "")]:
        mp.goto(BASE + path)
        w = mp.evaluate("document.documentElement.scrollWidth")
        check(f"mobile 390px no overflow {path}", w <= 390, str(w))
    check("no browser errors", not errors, "; ".join(errors[:3]))
    browser.close()

failed = [r for r in results if not r["ok"]]
print(f"{len(results) - len(failed)}/{len(results)} passed")
raise SystemExit(1 if failed else 0)
