"use client";
import { useId, useRef, useState } from "react";
import { SocialIcon } from "@/components/SocialIcon";
import { waLink, type WaCandidate, type WaMode } from "@/lib/whatsapp";

// Opens wa.me in a new tab (the WhatsApp app on phones): the CRM page, its open
// forms and their contents stay as they are. Nothing is recorded or sent from here.
const NOTICE =
  "Le message est rédigé et envoyé par vous dans WhatsApp. Rien n’est enregistré dans le CRM : notez l’échange dans les activités. Un numéro public ne vaut pas accord pour être prospecté sur WhatsApp.";

function fix(e: React.MouseEvent<HTMLAnchorElement>, c: WaCandidate) {
  if (!c.fixHref.startsWith("#")) return;
  const target = document.getElementById(c.fixHref.slice(1));
  if (!target) return;
  e.preventDefault();
  if (target instanceof HTMLDetailsElement) target.open = true;
  target.scrollIntoView({ block: "start" });
  const field = c.fixField && target.querySelector<HTMLElement>(`[name="${c.fixField}"]`);
  (field || target).focus({ preventScroll: true });
}

export function WhatsAppButton({ candidates, mode }: { candidates: WaCandidate[]; mode: WaMode }) {
  const id = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const icon = <span className="crm-wa__icon"><SocialIcon platform="whatsapp" /></span>;

  if (mode === "direct") {
    const c = candidates[0];
    return (
      <div className="crm-wa">
        <a className="crm-btn crm-btn--ghost" href={waLink(c.digits!)} target="_blank" rel="noopener noreferrer"
          aria-label={`Ouvrir WhatsApp avec ${c.person}, ${c.display} (nouvel onglet ou application)`}>
          {icon}Ouvrir WhatsApp
        </a>
        <small className="crm-sub">{c.person} · {c.display} · numéro indiqué comme WhatsApp ({c.source.toLowerCase()}). {NOTICE}</small>
      </div>
    );
  }

  const chosen = candidates.find((c) => c.key === key && c.digits);
  const ready = chosen && (chosen.whatsapp || confirmed);
  const valid = candidates.filter((c) => c.digits);
  const invalid = candidates.filter((c) => !c.digits);
  return (
    <div className="crm-wa">
      <button ref={toggle} type="button" className="crm-btn crm-btn--ghost" aria-expanded={open} aria-controls={`${id}-panel`}
        onClick={() => setOpen(!open)}>
        {icon}Ouvrir WhatsApp
      </button>
      {open && (
        <div id={`${id}-panel`} className="crm-wa__panel"
          onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); toggle.current?.focus(); } }}>
          {valid.length > 0 ? (
            <fieldset>
              <legend>Choisir l’interlocuteur et le numéro</legend>
              {valid.map((c) => (
                <label key={c.key} className="crm-wa__option">
                  <input type="radio" name={`${id}-number`} value={c.key} checked={key === c.key}
                    onChange={() => { setKey(c.key); setConfirmed(false); }} />
                  <span>
                    <strong>{c.person}</strong>{c.detail && <small className="crm-sub">{c.detail}</small>}
                    <span className="crm-wa__number">{c.display}</span>{" "}
                    {c.whatsapp
                      ? <span className="crm-badge crm-badge--ok">Indiqué WhatsApp</span>
                      : <span className="crm-badge crm-badge--off">Non identifié comme WhatsApp</span>}
                    <small className="crm-sub">{c.source} : « {c.raw} »</small>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : (
            <p className="crm-flash crm-flash--error" role="alert">Aucun numéro utilisable pour WhatsApp. Corrigez les coordonnées ci-dessous.</p>
          )}
          {chosen && !chosen.whatsapp && (
            <label className="crm-check crm-wa__confirm">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>Je confirme vouloir ouvrir {chosen.display} dans WhatsApp. Ce numéro n’est pas indiqué comme WhatsApp et son inscription n’a pas été vérifiée.</span>
            </label>
          )}
          {valid.length > 0 && (
            <div className="crm-wa__go">
              {ready ? (
                <>
                  <a className="crm-btn" href={waLink(chosen.digits!)} target="_blank" rel="noopener noreferrer"
                    aria-label={`Ouvrir la conversation WhatsApp avec ${chosen.person}, ${chosen.display} (nouvel onglet ou application)`}>
                    {icon}Ouvrir la conversation
                  </a>
                  <small className="crm-sub">{waLink(chosen.digits!).replace("https://", "")}</small>
                </>
              ) : (
                <small className="crm-sub" role="status">
                  {chosen ? "Cochez la confirmation pour continuer." : "Choisissez un numéro pour continuer."}
                </small>
              )}
            </div>
          )}
          {invalid.length > 0 && (
            <>
              <h3>Numéros absents ou à corriger</h3>
              <ul className="crm-list">
                {invalid.map((c) => (
                  <li key={c.key}>
                    <span><strong>{c.person}</strong>{c.detail && ` · ${c.detail}`}{c.raw && <> — « {c.raw} »</>}</span>
                    <small>{c.source} : {c.error} <a href={c.fixHref} onClick={(e) => fix(e, c)}>Corriger les coordonnées</a></small>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="crm-hint">{NOTICE}</p>
        </div>
      )}
    </div>
  );
}
