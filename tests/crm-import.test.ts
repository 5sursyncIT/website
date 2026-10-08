import { test } from "node:test";
import assert from "node:assert/strict";
import { csv } from "../src/lib/crm";
import { cleanCell, decodeCSV, mapColumns, parseCSV, planImport, siteKey, templateRows, type ExistingClient } from "../src/lib/crm-import";

const opts = { defaultStage: "prospect" as const, duplicates: "skip" as const };

test("CSV parsing: separators, quotes, line breaks and line numbers", () => {
  const semi = parseCSV("﻿Entreprise;Notes\r\nA;\"x;y\"\r\n\r\nB;\"deux\nlignes \"\"citées\"\"\"\r\nC;z");
  assert.equal(semi.separator, ";");
  assert.deepEqual(semi.records.map((r) => r.line), [1, 2, 4, 6]);
  assert.deepEqual(semi.records[1].cells, ["A", "x;y"]);
  assert.deepEqual(semi.records[2].cells, ["B", "deux\nlignes \"citées\""]);
  assert.equal(parseCSV("Nom,Ville\nA,Dakar").separator, ",");
  assert.equal(parseCSV("Nom\tVille\nA\tDakar").separator, "\t");
  assert.equal(parseCSV("Entreprise\nA\n").records.length, 2);
});

test("encoding: UTF-8 with BOM, else Windows-1252 (Excel français)", () => {
  assert.equal(decodeCSV(new TextEncoder().encode("﻿Société")), "Société");
  assert.equal(decodeCSV(new Uint8Array([0x53, 0x6f, 0x63, 0x69, 0xe9, 0x74, 0xe9])), "Société");
});

test("columns: accents and case ignored, unknown ones reported, name required", () => {
  const m = mapColumns(["ENTREPRISE", "Téléphone", "e-mail", "Site Web", "Responsable", "Créée le"]);
  assert.deepEqual(m.fields, ["name", "phone", "email", "website", null, null]);
  assert.deepEqual(m.ignored, ["Responsable", "Créée le"]);
  assert.equal(m.errors.length, 0);
  assert.match(mapColumns(["Ville", "Pays"]).errors[0], /Entreprise/);
  assert.match(mapColumns(["Nom", "Email", "Courriel"]).errors[0], /double/);
});

test("export cells neutralised with ' are restored", () => {
  assert.equal(cleanCell("'+221 77 000"), "+221 77 000");
  assert.equal(cleanCell("'=1+1"), "=1+1");
  assert.equal(cleanCell("l'apostrophe"), "l'apostrophe");
  assert.equal(siteKey("https://www.Exemple.sn/"), "exemple.sn");
});

test("plan: validation, labels, defaults, in-file and database duplicates", () => {
  const existing: ExistingClient[] = [
    { id: 7, name: "Société Générale", email: null, website: "https://sg.sn", city: "Dakar", phone: null },
  ];
  const file = [
    "Entreprise;Statut;Origine;Email;Téléphone;Site web;Ville",
    "Nouvelle SARL;;Prospection directe;CONTACT@NOUVELLE.SN;'+221 33 000;nouvelle.sn;Thiès",
    "societe generale;Client;;info@sg.sn;+221 1;;Rufisque",
    "Autre;Ancien client;;pas-un-email;;;",
    "Encore;Partenaire VIP;;;;;",
    ";Prospect;;;;;",
    "NOUVELLE sarl;;;;;;",
    "Par le site;;;;;www.sg.sn;",
  ].join("\n");
  const plan = planImport(file, existing, opts);
  assert.deepEqual(plan.errors, []);
  const [create, dup, badEmail, badStage, noName, inFile, bySite] = plan.rows;
  assert.equal(create.action, "create");
  assert.equal(create.data?.stage, "prospect");
  assert.equal(create.data?.source, "prospection");
  assert.equal(create.data?.email, "contact@nouvelle.sn");
  assert.equal(create.data?.phone, "+221 33 000");
  assert.equal(create.data?.website, "https://nouvelle.sn");
  assert.equal(dup.action, "skip");
  assert.equal(dup.target?.id, 7);
  assert.equal(badEmail.action, "error");
  assert.match(badEmail.reason!, /Email/);
  assert.match(badStage.reason!, /statut/);
  assert.match(noName.reason!, /Entreprise/);
  assert.match(inFile.reason!, /ligne 2/);
  assert.equal(bySite.action, "skip");
  assert.deepEqual(plan.counts, { total: 7, create: 1, complete: 0, skip: 2, error: 4 });
});

test("plan: completion fills only empty fields, never overwrites", () => {
  const existing: ExistingClient[] = [{ id: 3, name: "Alpha", city: "Dakar", email: null, phone: null }];
  const file = "Nom;Ville;Email;Statut\nAlpha;Thiès;a@alpha.sn;Client";
  const row = planImport(file, existing, { ...opts, duplicates: "complete" }).rows[0];
  assert.equal(row.action, "complete");
  assert.deepEqual(row.fill, { email: "a@alpha.sn" });
  const same = planImport("Nom;Ville\nAlpha;Thiès", existing, { ...opts, duplicates: "complete" }).rows[0];
  assert.equal(same.action, "skip");
});

test("the CRM's own export and the template re-import", () => {
  const exported = csv([
    ["Entreprise", "Statut", "Origine", "Secteur", "NINEA/RCCM", "Email", "Téléphone", "Site web", "Adresse", "Ville", "Pays", "Responsable", "Créée le"],
    ["Beta; et fils", "Ancien client", "Recommandation", "", "", "b@beta.sn", "+221 77 1", "https://beta.sn", "", "Dakar", "Sénégal", "Youssoupha", "2026-10-08"],
  ]);
  const plan = planImport(exported, [], opts);
  assert.deepEqual(plan.ignored, ["Responsable", "Créée le"]);
  assert.equal(plan.rows[0].action, "create");
  assert.equal(plan.rows[0].data?.name, "Beta; et fils");
  assert.equal(plan.rows[0].data?.stage, "inactive");
  assert.equal(plan.rows[0].data?.source, "recommandation");
  assert.equal(plan.rows[0].data?.phone, "+221 77 1");
  assert.equal(planImport(csv(templateRows), [], opts).rows[0].action, "create");
});

test("plan: empty file, header only, too many rows", () => {
  assert.match(planImport("", [], opts).errors[0], /vide/);
  assert.match(planImport("Entreprise\n", [], opts).errors[0], /Aucune ligne/);
  assert.match(planImport("Entreprise\n" + "x\n".repeat(2001), [], opts).errors[0], /Trop de lignes/);
});
