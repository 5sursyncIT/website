# Saves the visible text of the French pages, to compare two images (French must not change).
import os
from playwright.sync_api import sync_playwright
PATHS = ["/", "/services", "/reseaux-cloud", "/solutions-metier", "/developpement-api", "/maintenance-support",
         "/realisations", "/a-propos", "/contact", "/mentions-legales", "/politique-de-confidentialite"]
os.makedirs("/out/fr-text", exist_ok=True); os.chmod("/out/fr-text", 0o777)
with sync_playwright() as p:
    page = p.chromium.launch().new_page(viewport={"width": 1440, "height": 900})
    for path in PATHS:
        r = page.goto("http://localhost:3000" + path)
        page.wait_for_load_state("networkidle")
        name = path.strip("/") or "accueil"
        open(f"/out/fr-text/{name}.txt", "w").write(f"{r.status} {page.get_attribute('html', 'lang')}\n" + page.locator("body").inner_text())
        print(path, r.status)
