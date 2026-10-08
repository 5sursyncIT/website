// Admin login screen and navigation graphics.
// Logo with "data packets" travelling along its frame (CSS only, see custom.css).
export function Logo() {
  return (
    <div className="sync-admin-logo">
      <img src="/assets/logo-horizontal-transparent.png" alt="5/Sync IT" width={977} height={204} />
      <svg className="sync-admin-logo-flow" aria-hidden="true" focusable="false">
        <rect className="sync-flow-track" rx="14" pathLength="100" />
        <rect className="sync-flow-packet sync-flow-a" rx="14" pathLength="100" />
        <rect className="sync-flow-packet sync-flow-b" rx="14" pathLength="100" />
        <rect className="sync-flow-packet sync-flow-c" rx="14" pathLength="100" />
      </svg>
    </div>
  );
}
export function Icon() {
  return (
    <img
      className="sync-admin-icon"
      src="/favicon-5.png?v=20261007"
      alt="5/Sync IT"
      width={28}
      height={28}
    />
  );
}
