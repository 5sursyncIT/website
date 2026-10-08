// Line icons matching the site's stroke icon style (not official brand marks).
const paths: Record<string, React.ReactNode> = {
  facebook: <path d="M30 6h-5a8 8 0 0 0-8 8v28M11 21h17" />,
  instagram: (
    <>
      <rect x="7" y="7" width="34" height="34" rx="10" />
      <circle cx="24" cy="24" r="8" />
      <circle cx="34.5" cy="13.5" r="1" />
    </>
  ),
  linkedin: (
    <>
      <rect x="6" y="6" width="36" height="36" rx="4" />
      <path d="M15 21v13M15 14v1M22 34V21M22 27a6 6 0 0 1 12 0v7" />
    </>
  ),
  x: <path d="M9 8h9l21 32h-9ZM39 8 26 22M9 40l13-14" />,
  youtube: (
    <>
      <rect x="4" y="11" width="40" height="26" rx="8" />
      <path d="m20 18 10 6-10 6Z" />
    </>
  ),
  tiktok: <path d="M26 6v24a7 7 0 1 1-7-7M26 6c1 6 5 10 11 10" />,
  whatsapp: (
    <>
      <path d="M24 6a18 18 0 0 0-15.6 27L6 42l9.3-2.4A18 18 0 1 0 24 6Z" />
      <path d="M18 16c-2 2-2 5 1 9s7 6 9 5l2-2-4-3-2 2c-2-1-4-3-5-5l2-2-3-4Z" />
    </>
  ),
};
export function SocialIcon({ platform }: { platform: string }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[platform] ?? <circle cx="24" cy="24" r="16" />}
    </svg>
  );
}
