export function statusLabel(status: string) {
  return (
    (
      {
        open: "Ouvert",
        "in-progress": "En cours",
        "waiting-client": "En attente de votre réponse",
        resolved: "Résolu",
        closed: "Fermé",
      } as Record<string, string>
    )[status] || status
  );
}
