"use client";
import { useActionState } from "react";
import { importClients, previewClientImport, type ImportPreview } from "@/app/(crm)/crm/actions";
import { clientStages } from "@/lib/crm";
import { fieldLabels, IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, type ImportField, type PlannedRow } from "@/lib/crm-import";
import { Submit } from "./client";
// Two steps: the file is checked and every line's outcome shown (nothing written),
// then « Importer » sends the same text back; the server plans it again and writes.
const actionLabels: Record<PlannedRow["action"], [string, string]> = {
  create: ["À créer", "ok"],
  complete: ["À compléter", "info"],
  skip: ["Ignorée", "off"],
  error: ["Erreur", "wait"],
};
const SHOWN = 500;
function detail(row: PlannedRow) {
  if (row.action === "complete")
    return `Fiche « ${row.target?.name} » : ajout de ${Object.keys(row.fill ?? {}).map((f) => fieldLabels[f as ImportField].toLowerCase()).join(", ")} (les champs remplis ne sont pas modifiés).`;
  if (row.action === "create") return [row.data?.city, row.data?.email ?? row.data?.phone].filter(Boolean).join(" · ") || "—";
  return row.reason ?? "";
}
export function ClientImport() {
  const [state, preview] = useActionState<ImportPreview, FormData>(previewClientImport, {});
  const opts = state.options ?? { defaultStage: "prospect", duplicates: "skip" };
  const rows = state.rows ?? [];
  // Problems first, so they are not lost at the bottom of a long file.
  const ordered = [...rows].sort((a, b) => Number(b.action === "error") - Number(a.action === "error"));
  const todo = (state.counts?.create ?? 0) + (state.counts?.complete ?? 0);
  return (
    <>
      <section className="crm-card">
        <h2>1. Choisir le fichier</h2>
        <form action={preview} className="crm-form">
          <div className="crm-grid">
            <label className="crm-span-2">
              Fichier CSV *
              <input type="file" name="file" accept=".csv,text/csv,.txt" required />
            </label>
            <label>
              Statut si la colonne est absente ou vide
              <select name="defaultStage" defaultValue={opts.defaultStage}>
                {clientStages.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label>
              Entreprise déjà présente (même nom, email ou site)
              <select name="duplicates" defaultValue={opts.duplicates}>
                <option value="skip">L’ignorer</option>
                <option value="complete">Compléter ses champs vides</option>
              </select>
            </label>
          </div>
          <p className="crm-hint">
            Première ligne : les titres des colonnes. Seule « Entreprise » (ou « Nom ») est obligatoire ; reconnues aussi :
            Statut, Origine, Secteur, NINEA/RCCM, Email, Téléphone, Site web, Adresse, Ville, Pays, Notes. Séparateur point-virgule,
            virgule ou tabulation ; UTF-8 ou format Excel. {IMPORT_MAX_ROWS} lignes et {IMPORT_MAX_BYTES / 1024} Ko au plus.
            Un export du CRM se réimporte tel quel. <a href="/crm/export/modele-clients">Télécharger le modèle</a>.
          </p>
          <Submit>Vérifier le fichier</Submit>
        </form>
      </section>
      {state.error && <p className="crm-flash crm-flash--error" role="alert">{state.error}</p>}
      {state.counts && (
        <section className="crm-card" aria-live="polite">
          <h2>2. Vérifier puis importer</h2>
          <p className="crm-hint">
            {state.fileName} — {state.counts.total} ligne{state.counts.total > 1 ? "s" : ""}, séparateur {state.separator}.
            Colonnes reprises : {(state.mapped ?? []).map((f) => fieldLabels[f as ImportField]).join(", ")}.
            {state.ignored?.length ? ` Colonnes ignorées : ${state.ignored.join(", ")}.` : ""}
          </p>
          <div className="crm-stats">
            <div className="crm-stat"><strong>{state.counts.create}</strong><span>à créer</span></div>
            <div className="crm-stat"><strong>{state.counts.complete}</strong><span>à compléter</span></div>
            <div className="crm-stat"><strong>{state.counts.skip}</strong><span>ignorées (déjà présentes)</span></div>
            <div className={`crm-stat${state.counts.error ? " crm-stat--warn" : ""}`}><strong>{state.counts.error}</strong><span>en erreur (non importées)</span></div>
          </div>
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead><tr><th className="num">Ligne</th><th>Entreprise</th><th>Résultat</th><th>Détail</th></tr></thead>
              <tbody>
                {ordered.slice(0, SHOWN).map((r) => (
                  <tr key={r.line}>
                    <td className="num">{r.line}</td>
                    <td>{r.name || "—"}</td>
                    <td><span className={`crm-badge crm-badge--${actionLabels[r.action][1]}`}>{actionLabels[r.action][0]}</span></td>
                    <td>{detail(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > SHOWN && <p className="crm-hint">{rows.length - SHOWN} lignes de plus non affichées (même traitement).</p>}
          {todo ? (
            <form action={importClients} className="crm-form">
              <input type="hidden" name="csv" value={state.csv ?? ""} />
              <input type="hidden" name="defaultStage" value={opts.defaultStage} />
              <input type="hidden" name="duplicates" value={opts.duplicates} />
              <input type="hidden" name="back" value="/crm/clients/importer" />
              <label className="crm-check"><input type="checkbox" name="owner" defaultChecked /> Me désigner responsable des entreprises créées</label>
              <p className="crm-hint">
                Tout ou rien : si le CRM refuse une ligne au moment de l’import, aucune entreprise n’est enregistrée.
                Les lignes en erreur ne sont pas importées ; corrigez le fichier et relancez la vérification pour les ajouter.
              </p>
              <Submit confirm={`Importer ${state.counts.create} création(s) et ${state.counts.complete} complément(s) ?`}>
                Importer {todo} entreprise{todo > 1 ? "s" : ""}
              </Submit>
            </form>
          ) : (
            <p className="crm-empty">Rien à importer : aucune ligne à créer ou à compléter.</p>
          )}
        </section>
      )}
    </>
  );
}
