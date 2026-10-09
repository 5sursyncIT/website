"use client";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <main id="contenu" className="container support-shell">
      <h1>The service is temporarily unavailable.</h1>
      <p>Your request was not confirmed. Please try again later.</p>
      <button className="button aqua" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
