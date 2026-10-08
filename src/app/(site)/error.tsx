"use client";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <main id="contenu" className="container support-shell">
      <h1>Le service est temporairement indisponible.</h1>
      <p>Votre demande n’a pas été confirmée. Réessayez plus tard.</p>
      <button className="button aqua" onClick={reset}>
        Réessayer
      </button>
    </main>
  );
}
