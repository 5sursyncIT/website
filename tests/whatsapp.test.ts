import { test } from "node:test";
import assert from "node:assert/strict";
import { findNumbers, waCandidates, waLink, waMode, waNumber } from "../src/lib/whatsapp";

const digits = (raw: string, country?: string | null) => {
  const n = waNumber(raw, country);
  return n.ok ? n.digits : null;
};

test("international formats: spaces, brackets, dashes, dots, + and 00", () => {
  assert.equal(digits("+221 77 123 45 67"), "221771234567");
  assert.equal(digits("00221 77-123-45-67"), "221771234567");
  assert.equal(digits("(+221) 77.123.45.67"), "221771234567");
  assert.equal(digits("+221 (33) 800 00 00"), "221338000000");
  assert.equal(digits("+33 (0)6 12 34 56 78"), "33612345678");
  assert.equal(digits("+33 6 12 34 56 78"), "33612345678");
  assert.equal(digits("0044 20 7946 0958"), "442079460958");
  assert.equal(digits("+1 (415) 555-0132"), "14155550132");
  assert.equal(digits("+225 07 07 12 34 56"), "2250707123456");
  assert.equal(waLink("221771234567"), "https://wa.me/221771234567");
  const n = waNumber("+221771234567");
  assert.ok(n.ok && n.display === "+221 77 123 45 67");
});

test("local numbers: +221 added only for a Senegalese company", () => {
  assert.equal(digits("77 123 45 67", "Sénégal"), "221771234567");
  assert.equal(digits("33-800-00-00", "SENEGAL"), "221338000000");
  assert.equal(digits("771234567", "SN"), "221771234567");
  // Country code typed without + : unambiguous for Senegal only.
  assert.equal(digits("221 77 123 45 67", null), "221771234567");
  // Missing or other country: never guessed.
  assert.equal(digits("77 123 45 67", null), null);
  assert.equal(digits("77 123 45 67", ""), null);
  assert.equal(digits("06 12 34 56 78", "France"), null);
  assert.equal(digits("07 07 12 34 56", "Côte d’Ivoire"), null);
  const r = waNumber("77 123 45 67", "Mali");
  assert.ok(!r.ok && /Indicatif manquant \(pays : Mali\)/.test(r.reason));
  assert.ok(!waNumber("77 123 45 67").ok && /pays non renseigné/.test((waNumber("77 123 45 67") as { reason: string }).reason));
});

test("invalid numbers are refused with a reason", () => {
  for (const [raw, country] of [
    ["", "Sénégal"], ["77 123 45", "Sénégal"], ["77 123 45 678", "Sénégal"], ["67 123 45 67", "Sénégal"],
    ["+221 77 123 45", null], ["+221 66 123 45 67", null], ["+0 77", null], ["+12 34", null],
    ["+1234567890123456", null], ["77 12x 45 67", "Sénégal"], ["+221 77 +123", null], ["77+1234567", "Sénégal"],
  ] as const) {
    const n = waNumber(raw, country);
    assert.equal(n.ok, false, raw);
    assert.ok(!n.ok && n.reason.length > 5);
  }
});

test("numbers found in a phone field, WhatsApp label per segment", () => {
  assert.deepEqual(findNumbers("33 800 00 00 / WhatsApp : 77 123 45 67"), [
    { raw: "33 800 00 00", whatsapp: false }, { raw: "77 123 45 67", whatsapp: true },
  ]);
  assert.deepEqual(findNumbers("+221 77 123 45 67 (WA), 78 000 00 00"), [
    { raw: "+221 77 123 45 67", whatsapp: true }, { raw: "78 000 00 00", whatsapp: false },
  ]);
  assert.deepEqual(findNumbers("Standard 33 800 00 00 ou 76 111 22 33"), [
    { raw: "33 800 00 00", whatsapp: false }, { raw: "76 111 22 33", whatsapp: false },
  ]);
  assert.deepEqual(findNumbers(null), []);
  // Notes: only the WhatsApp-labelled numbers, never dates or other figures.
  const notes = "Appel le 2026-10-08, standard 33 800 00 00.\nWhatsApp du directeur : +221 70 555 66 77 (source : site, 08.10.2026)\nCA 1 500 000 000";
  assert.deepEqual(findNumbers(notes, true), [{ raw: "+221 70 555 66 77", whatsapp: true }]);
  assert.deepEqual(findNumbers("Pas de WhatsApp connu.", true), []);
});

const client = { id: 7, name: "Fixture SARL", phone: "33 800 00 00", notes: null, country: "Sénégal" };

test("company page: every interlocutor, WhatsApp first, nothing picked arbitrarily", () => {
  const list = waCandidates({
    client,
    contacts: [
      { id: 1, name: "Awa Ndiaye", primary: true, jobTitle: "DG", phone: "77 123 45 67", notes: null },
      { id: 2, name: "Moussa Fall", phone: "WhatsApp 78 222 33 44", notes: null },
      { id: 3, name: "Sans Numéro", phone: null, notes: null },
      { id: 4, name: "Mal Saisi", phone: "77 12", notes: null },
    ],
    scope: "client",
  });
  assert.deepEqual(list.map((c) => [c.person, c.digits, c.whatsapp]), [
    ["Moussa Fall", "221782223344", true],
    ["Fixture SARL", "221338000000", false],
    ["Awa Ndiaye", "221771234567", false],
    ["Sans Numéro", null, false],
    ["Mal Saisi", null, false],
  ]);
  assert.equal(list[2].detail, "Interlocuteur principal · DG");
  assert.equal(list[3].error, "Aucun numéro enregistré.");
  assert.equal(list[3].fixHref, "/crm/contacts/3#modifier");
  assert.equal(list[1].fixHref, "#coordonnees");
  assert.equal(list[1].fixField, "phone");
  // Several interlocutors: always a choice, even with one WhatsApp number.
  assert.equal(waMode(list), "choose");
});

test("modes: direct only for a single identified WhatsApp number", () => {
  const direct = waCandidates({ client: { ...client, phone: "WhatsApp +221 77 123 45 67" }, contacts: [], scope: "client" });
  assert.equal(waMode(direct), "direct");
  assert.equal(direct[0].digits, "221771234567");
  const unidentified = waCandidates({ client, contacts: [], scope: "client" });
  assert.equal(waMode(unidentified), "choose");
  const none = waCandidates({ client: { ...client, phone: null }, contacts: [], scope: "client" });
  assert.equal(waMode(none), "none");
  assert.equal(none[0].error, "Aucun numéro enregistré.");
  // Ambiguous country: shown as invalid, never guessed.
  const ambiguous = waCandidates({ client: { ...client, country: "" }, contacts: [], scope: "client" });
  assert.equal(waMode(ambiguous), "none");
  assert.match(ambiguous[0].error!, /Indicatif manquant/);
  // Same number in the phone field and labelled in the notes: one entry, WhatsApp.
  const merged = waCandidates({ client: { ...client, phone: "77 123 45 67", notes: "WhatsApp : +221771234567" }, contacts: [], scope: "client" });
  assert.equal(merged.length, 1);
  assert.equal(waMode(merged), "direct");
  // Text without a usable number is reported, not dropped.
  const text = waCandidates({ client: { ...client, phone: "voir standard" }, contacts: [], scope: "client" });
  assert.equal(text[0].raw, "voir standard");
  assert.ok(text[0].error);
});

test("contact page: that contact only, company country, local fix link", () => {
  const list = waCandidates({ client, contacts: [{ id: 9, name: "Awa", phone: "77 123 45 67 / 76 000 11 22 (WhatsApp)" }], scope: "contact" });
  assert.deepEqual(list.map((c) => [c.digits, c.whatsapp]), [["221760001122", true], ["221771234567", false]]);
  assert.equal(list[0].fixHref, "#modifier");
  assert.equal(waMode(list), "choose");
  // Inputs are not modified.
  const contact = { id: 9, name: "Awa", phone: "77 123 45 67" };
  waCandidates({ client, contacts: [contact], scope: "contact" });
  assert.deepEqual(contact, { id: 9, name: "Awa", phone: "77 123 45 67" });
});
