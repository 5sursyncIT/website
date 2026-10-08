"""Génère le SQL d'import des prospects contactés (crm_prospects_2026-10-08.json).

Usage : python3 -I imports/build_crm_import_sql.py <json> <out.sql> <ROLLBACK|COMMIT>

Reproduit ce que ferait Payload : search_text = normalizeSearch() de src/lib/crm.ts,
clients.stage/source, activité email terminée (done_at = heure d'envoi, sans rappel),
auteur et responsable = premier admin. Idempotent : une entreprise est reprise si son
nom, son email ou son site correspond déjà (seuls ses champs vides sont complétés) ;
une activité n'est pas recréée si son identifiant Outlook figure déjà dans une activité.
Aucun contact, opportunité, tâche, relance ni envoi.
"""
import json, re, sys, unicodedata

ADMIN_EMAIL = "ydiop@5sursync.com"
LIMITS = {"name": None, "sector": 80, "phone": 40, "website": 200, "city": 80, "country": 60, "email": None}


def normalize_search(*parts):
    s = " ".join(str(p) for p in parts if p is not None and p != "")
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.category(c).startswith("M"))
    s = re.sub(r"[\s﻿]+", " ", s.lower()).strip()
    return s[:2000]


def q(v):
    return "NULL" if v is None or v == "" else "'" + str(v).replace("'", "''") + "'"


def clean_body(text):
    text = text.replace("﻿", "")
    # Signature retirée (connue, identique partout) : on garde le message jusqu'à « Cordialement, ».
    text = text.split("Cordialement,")[0] + "Cordialement,\nPapa Youssoupha DIOP, 5/Sync IT"
    lines = [l.rstrip() for l in text.splitlines()]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def fmt(iso):
    # 2026-10-08T09:05:31Z -> 08/10/2026 09:05 UTC
    d, t = iso.rstrip("Z").split("T")
    y, m, dd = d.split("-")
    return f"{dd}/{m}/{y} {t[:5]} UTC"


def delivery(act):
    st = act["delivery_status"]
    if st == "failed":
        f = act["delivery_failure"]
        err = re.search(r"Erreur :\|\s*_(.*?)_", f["diagnostic"], re.S)
        err = re.sub(r"\s+", " ", err.group(1)).strip() if err else ""
        return ("ÉCHEC", f"Échec de remise : {f['smtp_code']} ({f['category']}), notification reçue le {fmt(f['received_at_utc'])}.\nMessage du serveur : {err}")
    if st == "automatic_acknowledgment_received":
        a = act["automatic_acknowledgment"]
        return ("ACCUSÉ AUTO", f"Accusé automatique reçu le {fmt(a['received_at_utc'])} (« {a['subject']} »). Ce n'est ni une preuve de lecture ni un intérêt commercial.")
    return ("INCONNUE", "Remise inconnue : aucun rejet reçu, ce qui ne prouve pas la remise.")


def build(data):
    stmts, plan = [], []
    for r in data["records"]:
        m, c = r["business_metadata"], r["contact"]
        assert r["is_client"] is False and len(r["activities"]) == 1
        act = r["activities"][0]
        assert act["type"] == "email_outbound" and act["sender_email"] == ADMIN_EMAIL
        fields = {"name": r["organization"], "sector": m.get("sector"), "email": c["email"],
                  "phone": m.get("public_phone"), "website": m.get("website"),
                  "city": m.get("city"), "country": m.get("country")}
        places = None
        if fields["city"] and len(fields["city"]) > 80:
            places = fields["city"]
            fields["city"] = fields["city"].split("/")[0].strip() + " (réseau régional)"
        for k, lim in LIMITS.items():
            if lim and fields[k] and len(fields[k]) > lim:
                raise SystemExit(f"{r['organization']}: {k} > {lim} caractères")
        assert re.match(r"^https?://[^\s/@]+\.[^\s@]+$", fields["website"], re.I)
        status, deliv = delivery(act)
        notes = "\n".join(x for x in [
            f"Prospection par email du {fmt(act['sent_copy_time_utc'])[:10]} (import {data['scope_date']}, fichier crm_prospects_2026-10-08.json"
            + (f", réf. {r['source_prospect_id']}" if r["source_prospect_id"] else "") + ").",
            "Prospect seulement : aucun besoin, budget, projet ni décideur confirmé. Intérêt commercial non confirmé.",
            f"Premier email : {deliv.splitlines()[0]}",
            "",
            f"Priorité : {m.get('priority')} — {m.get('priority_reason')}",
            f"Interlocuteur visé : {m.get('target_role')} (personne non identifiée)",
            f"Type : {m.get('type')}",
            f"Implantations : {places}" if places else None,
            f"Constats publics : {m.get('evidence')} (source : {m.get('evidence_source')})",
            f"Piste (hypothèse à qualifier) : {m.get('service_proposal')}",
            f"Adresse email publique : {m.get('public_email')}" if m.get("public_email") and m.get("public_email") != c["email"] else None,
            f"Page contact : {m.get('contact_url')} ; sources des coordonnées : {m.get('contact_source')}",
            f"Vérification : {m.get('verification_status')} (le {m.get('checked_date')})",
            f"Remarques de la recherche, rédigées avant l'envoi : {m.get('notes')}" if m.get("notes") else None,
        ] if x is not None)
        notes = re.sub(r"\n{3,}", "\n\n", notes).strip()
        assert len(notes) <= 5000, r["organization"]
        csearch = normalize_search(fields["name"], fields["email"], fields["phone"], fields["city"], fields["sector"], None, notes)

        mid = act["outlook_message_id"]
        details = "\n".join([
            f"Email envoyé le {fmt(act['sent_copy_time_utc'])} à {act['recipient_email']} depuis {act['sender_email']}.",
            "Heure de la copie dans « Éléments envoyés » d'Outlook, pas une heure de remise.",
            deliv,
            f"Message dans Outlook : {act['outlook_url']}",
            f"Identifiant Outlook : {mid}",
            "",
            "— Texte envoyé (signature omise) —",
            clean_body(act["body_text_as_returned_by_outlook"]),
        ])
        assert len(details) <= 10000 and len(act["subject"]) <= 200, r["organization"]
        asearch = normalize_search(act["subject"], details)
        sent = act["sent_copy_time_utc"]
        site = fields["website"].lower().rstrip("/")
        stmts.append(f"""
DO $$
DECLARE cid integer; aid integer; created boolean := false;
BEGIN
  SELECT id INTO aid FROM admins WHERE email = {q(ADMIN_EMAIL)};
  IF aid IS NULL THEN RAISE EXCEPTION 'admin introuvable'; END IF;
  SELECT id INTO cid FROM clients
   WHERE lower(name) = lower({q(fields['name'])}) OR lower(email) = lower({q(fields['email'])})
      OR rtrim(lower(website), '/') = {q(site)}
   ORDER BY id LIMIT 1;
  IF cid IS NULL THEN
    INSERT INTO clients (name, stage, source, owner_id, sector, email, phone, website, city, country, notes, search_text)
    VALUES ({q(fields['name'])}, 'prospect', 'prospection', aid, {q(fields['sector'])}, {q(fields['email'])},
            {q(fields['phone'])}, {q(fields['website'])}, {q(fields['city'])}, {q(fields['country'])}, {q(notes)}, {q(csearch)})
    RETURNING id INTO cid;
    created := true;
  ELSE
    -- Entreprise existante : on ne remplace rien, on complète seulement les champs vides.
    UPDATE clients SET sector = coalesce(sector, {q(fields['sector'])}), email = coalesce(email, {q(fields['email'])}),
      phone = coalesce(phone, {q(fields['phone'])}), website = coalesce(website, {q(fields['website'])}),
      city = coalesce(city, {q(fields['city'])}), country = coalesce(country, {q(fields['country'])}),
      source = coalesce(source, 'prospection'), owner_id = coalesce(owner_id, aid),
      notes = CASE WHEN notes IS NULL OR notes = '' THEN {q(notes)} ELSE notes || E'\\n\\n' || {q(notes)} END,
      updated_at = now()
    WHERE id = cid;
    UPDATE clients SET search_text = left(regexp_replace(lower(search_text || ' ' || {q(csearch)}), '\\s+', ' ', 'g'), 2000) WHERE id = cid;
  END IF;
  IF EXISTS (SELECT 1 FROM crm_activities WHERE strpos(details, {q(mid)}) > 0) THEN
    RAISE NOTICE 'IMPORT|%|%|activite deja presente|{status}', {q(fields['name'])}, CASE WHEN created THEN 'cree' ELSE 'existant ' || cid END;
  ELSE
    INSERT INTO crm_activities (kind, subject, details, client_id, done, done_at, remind, author_id, created_at, updated_at, search_text)
    VALUES ('email', {q(act['subject'])}, {q(details)}, cid, true, {q(sent)}, false, aid, {q(sent)}, now(), {q(asearch)});
    RAISE NOTICE 'IMPORT|%|%|activite email ajoutee|{status}', {q(fields['name'])}, CASE WHEN created THEN 'cree' ELSE 'existant ' || cid END;
  END IF;
END $$;""")
        plan.append(r["organization"])
    return stmts, plan


def main():
    src, out, end = sys.argv[1], sys.argv[2], sys.argv[3]
    assert end in ("ROLLBACK", "COMMIT")
    data = json.load(open(src, encoding="utf-8"))
    assert len(data["records"]) == data["counts"]["contacted_organizations"] == 27
    stmts, plan = build(data)
    with open(out, "w", encoding="utf-8") as f:
        f.write("\\set ON_ERROR_STOP on\nBEGIN;\n")
        f.write("SELECT 'AVANT|clients=' || (SELECT count(*) FROM clients) || '|activites=' || (SELECT count(*) FROM crm_activities);\n")
        f.write("\n".join(stmts))
        f.write("\nSELECT 'APRES|clients=' || (SELECT count(*) FROM clients) || '|prospects=' || (SELECT count(*) FROM clients WHERE stage='prospect')"
                " || '|activites=' || (SELECT count(*) FROM crm_activities) || '|contacts=' || (SELECT count(*) FROM crm_contacts)"
                " || '|opportunites=' || (SELECT count(*) FROM crm_deals) || '|taches_a_faire=' || (SELECT count(*) FROM crm_activities WHERE done IS NOT TRUE);\n")
        f.write(f"{end};\n")
    print(f"{len(plan)} entreprises, SQL écrit dans {out} ({end})")


main()
