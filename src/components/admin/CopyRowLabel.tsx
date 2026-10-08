"use client";
import { useRowLabel } from "@payloadcms/ui";
const countryNames: Record<string, string> = { SEN: 'Sénégal', CIV: 'Côte d’Ivoire', GIN: 'Guinée', GNB: 'Guinée-Bissau', COD: 'République démocratique du Congo', COG: 'République du Congo (Congo-Brazzaville)' };
// Collapsed page texts show their key and the start of the text instead of "Texte 12".
export function CopyRowLabel() {
  const { data, rowNumber } = useRowLabel<{ key?: string; value?: string }>();
  const value = (data?.value ?? "").replace(/\s+/g, " ").trim();
  const missionCountry = data?.key?.startsWith('africa-mission-') ? countryNames[data.key.slice('africa-mission-'.length)] : undefined;
  return (
    <span className="sync-copy-label">
      <strong>{missionCountry ? `Mission — ${missionCountry} (facultatif)` : data?.key || `Texte ${(rowNumber ?? 0) + 1}`}</strong>
      {value && <span> — {value.length > 90 ? value.slice(0, 90) + "…" : value}</span>}
    </span>
  );
}
