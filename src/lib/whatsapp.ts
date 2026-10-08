// "Ouvrir WhatsApp" in /crm: a wa.me link opened by a person, nothing more. No API,
// no message, no record: these functions only read the existing phone and notes fields.
import { normalizeSearch } from "./crm";

export type WaNumber = { ok: true; digits: string; display: string } | { ok: false; reason: string };

const isSenegal = (country?: string | null) => {
  const c = normalizeSearch(country).trim();
  return c === "sn" || c.includes("senegal");
};
// Senegal: 9 national digits, mobiles 7x, fixed lines 33 (WhatsApp Business accepts both).
const senegalNational = (n: string) => /^[37]\d{8}$/.test(n);
const senegalDisplay = (n: string) => `+221 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5, 7)} ${n.slice(7)}`;
const display = (digits: string) => (digits.startsWith("221") && digits.length === 12 ? senegalDisplay(digits.slice(3)) : `+${digits}`);
const ok = (digits: string): WaNumber => ({ ok: true, digits, display: display(digits) });

// Normalises one number to international digits. A missing country code is only added
// when the company's country is Senegal and the number has the Senegalese format.
export function waNumber(raw: string, country?: string | null): WaNumber {
  let s = raw.trim();
  if (!s) return { ok: false, reason: "Aucun numéro." };
  if (/[^\d\s()+.\-]/.test(s)) return { ok: false, reason: "Caractères inattendus dans le numéro." };
  // "+33 (0)6 …": the bracketed trunk 0 is not dialled from abroad.
  s = s.replace(/^(\s*(?:\+|00)\s*\d{1,3}\s*)\(0\)/, "$1");
  const compact = s.replace(/[\s().\-]/g, "");
  if ((compact.match(/\+/g) ?? []).length > 1 || compact.indexOf("+") > 0) return { ok: false, reason: "Signe + mal placé." };
  const international = compact.startsWith("+") || compact.startsWith("00");
  const digits = compact.replace(/^\+|^00/, "");
  if (!/^\d+$/.test(digits)) return { ok: false, reason: "Numéro incomplet." };
  if (international) {
    if (digits.startsWith("0")) return { ok: false, reason: "Indicatif pays invalide." };
    if (digits.startsWith("221")) {
      return senegalNational(digits.slice(3)) ? ok(digits) : { ok: false, reason: "Numéro sénégalais : 9 chiffres attendus après +221." };
    }
    if (digits.length < 8 || digits.length > 15) return { ok: false, reason: "Longueur incorrecte pour un numéro international." };
    return ok(digits);
  }
  // Country code typed without + or 00 ("221 77 …"): unambiguous for Senegal only.
  if (digits.length === 12 && digits.startsWith("221") && senegalNational(digits.slice(3))) return ok(digits);
  if (isSenegal(country)) {
    return senegalNational(digits) ? ok("221" + digits) : { ok: false, reason: "Numéro sénégalais : 9 chiffres attendus (ex. 77 123 45 67)." };
  }
  return {
    ok: false,
    reason: country?.trim()
      ? `Indicatif manquant (pays : ${country.trim()}) : saisir le numéro au format international (+…).`
      : "Indicatif manquant et pays non renseigné : saisir le numéro au format international (+…).",
  };
}

export const waLink = (digits: string) => `https://wa.me/${digits}`;

// A number is "identified as WhatsApp" only when its own segment says so.
const WA_LABEL = /whats\s*-?\s*app|\bwa\b|\bwhatsapp\b/i;
const NUMBER = /(?:\+|00)?\s*\(?\+?\d[\d\s().\-]{5,}\d\)?/g;
const DATE = /^\d{4}-\d{2}-\d{2}$|^\d{2}[.\-]\d{2}[.\-]\d{4}$/;
export type FoundNumber = { raw: string; whatsapp: boolean };
// Numbers of a free-text field. Segments are separated by / , ; | newline or " ou ".
// onlyWhatsApp (notes): keep only the numbers whose segment mentions WhatsApp.
export function findNumbers(text?: string | null, onlyWhatsApp = false): FoundNumber[] {
  if (!text) return [];
  const found: FoundNumber[] = [];
  for (const segment of text.split(/[\/,;|\n]|\s+ou\s+/i)) {
    const whatsapp = WA_LABEL.test(segment);
    if (onlyWhatsApp && !whatsapp) continue;
    for (const m of segment.matchAll(NUMBER)) {
      const raw = m[0].trim();
      if (DATE.test(raw) || raw.replace(/\D/g, "").length < 7) continue;
      found.push({ raw, whatsapp });
    }
  }
  return found;
}

export type WaCandidate = {
  key: string;
  person: string;
  detail: string;
  source: string;
  raw: string;
  whatsapp: boolean;
  digits: string | null;
  display: string | null;
  error: string | null;
  fixHref: string;
  fixField: "phone" | "notes" | null;
};
type Person = { id: number; name: string; phone?: string | null; notes?: string | null };
type ContactPerson = Person & { jobTitle?: string | null; primary?: boolean | null };

function personCandidates(kind: "client" | "contact", p: Person, detail: string, country: string | null | undefined, fixHref: string, local: boolean): WaCandidate[] {
  const label = kind === "client" ? "de l’entreprise" : "du contact";
  const items = [
    ...findNumbers(p.phone).map((n) => ({ ...n, source: `Téléphone ${label}`, field: "phone" as const })),
    ...findNumbers(p.notes, true).map((n) => ({ ...n, source: `Notes ${label}`, field: "notes" as const })),
  ];
  // A phone field with text but no recognisable number is reported, never ignored.
  if (p.phone?.trim() && !findNumbers(p.phone).length) items.push({ raw: p.phone.trim(), whatsapp: WA_LABEL.test(p.phone), source: `Téléphone ${label}`, field: "phone" });
  const out: WaCandidate[] = [];
  for (const item of items) {
    const n = waNumber(item.raw.replace(WA_LABEL, ""), country);
    const same = n.ok ? out.find((c) => c.digits === n.digits) : undefined;
    if (same) { same.whatsapp ||= item.whatsapp; continue; }
    out.push({
      key: `${kind}-${p.id}-${out.length}`,
      person: p.name,
      detail,
      source: item.source,
      raw: item.raw,
      whatsapp: item.whatsapp,
      digits: n.ok ? n.digits : null,
      display: n.ok ? n.display : null,
      error: n.ok ? null : n.reason,
      fixHref,
      fixField: local ? item.field : null,
    });
  }
  if (!out.length)
    out.push({ key: `${kind}-${p.id}-none`, person: p.name, detail, source: `Téléphone ${label}`, raw: "", whatsapp: false, digits: null, display: null, error: "Aucun numéro enregistré.", fixHref, fixField: local ? "phone" : null });
  return out;
}

// Every number that can be offered for a company page (company + each contact) or a
// contact page (that contact only). Identified WhatsApp numbers first, invalid last;
// otherwise the original order (company, then contacts as the page lists them).
export function waCandidates(input: { client: Person & { country?: string | null }; contacts: ContactPerson[]; scope: "client" | "contact" }): WaCandidate[] {
  const { client, contacts, scope } = input;
  const contactDetail = (c: ContactPerson) => [c.primary ? "Interlocuteur principal" : "", c.jobTitle ?? ""].filter(Boolean).join(" · ");
  const list = scope === "client"
    ? [
        ...personCandidates("client", client, "Entreprise", client.country, "#coordonnees", true),
        ...contacts.flatMap((c) => personCandidates("contact", c, contactDetail(c), client.country, `/crm/contacts/${c.id}#modifier`, false)),
      ]
    : contacts.flatMap((c) => personCandidates("contact", c, contactDetail(c), client.country, "#modifier", true));
  const rank = (c: WaCandidate) => (c.digits ? (c.whatsapp ? 0 : 1) : 2);
  return list.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map(({ c }) => c);
}

// Direct link only when there is nothing to choose: one candidate, valid, identified
// as WhatsApp. Otherwise the person picks (and confirms an unidentified number).
export type WaMode = "direct" | "choose" | "none";
export function waMode(candidates: WaCandidate[]): WaMode {
  if (!candidates.some((c) => c.digits)) return "none";
  return candidates.length === 1 && candidates[0].whatsapp ? "direct" : "choose";
}
