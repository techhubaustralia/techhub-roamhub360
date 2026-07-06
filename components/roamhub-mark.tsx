// RoamHub360 logomark — a workspace hub held in a 360° orbit with a satellite,
// on a self-contained dark tile (holds on any background). A TechHub Australia
// sub-brand mark. To swap in an updated vector, replace the geometry below or
// point at /roamhub360-logo.svg.
export function RoamHubMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="RoamHub360" fill="none">
      <defs>
        <linearGradient id="rhMarkGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2B7DD1" />
          <stop offset="1" stopColor="#29C5EE" />
        </linearGradient>
        <linearGradient id="rhMarkTile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#12294a" />
          <stop offset="1" stopColor="#0a1830" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="58" height="58" rx="15" fill="url(#rhMarkTile)" stroke="#27395C" />
      <circle
        cx="32"
        cy="32"
        r="18"
        fill="none"
        stroke="url(#rhMarkGrad)"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeDasharray="94 19"
        transform="rotate(-58 32 32)"
      />
      <rect x="24.5" y="24.5" width="15" height="15" rx="4.2" fill="#EDF3FC" />
      <circle cx="49" cy="21.6" r="4.1" fill="#29C5EE" />
    </svg>
  );
}
