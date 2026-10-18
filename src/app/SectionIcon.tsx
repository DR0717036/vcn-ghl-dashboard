// Animated section icons: inline SVG, brand colors, animated with CSS
// keyframes (see base.css, "section icons"). Each icon plays once when its
// band heading scrolls into view (Motion.tsx adds "is-playing") and loops
// subtly while its item in the side nav is hovered or focused. No icon
// library; each SVG is well under 2KB. Server-renderable (no hooks).

import type { SectionIconName } from "./sections";

const A = "var(--ico-a)"; // brand blue
const B = "var(--ico-b)"; // brand gold
const L = "var(--ico-line)"; // outline color

function Submissions() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      {/* mailbox */}
      <rect x="8" y="22" width="32" height="20" rx="4" fill={B} />
      <rect x="14" y="26" width="20" height="3" rx="1.5" fill="rgba(0,0,0,0.35)" className="ico-slot" />
      <rect x="22" y="42" width="4" height="4" fill={B} />
      {/* envelope dropping into the slot */}
      <g className="ico-env">
        <rect x="15" y="8" width="18" height="12" rx="2" fill="#fff" stroke={A} strokeWidth="2" />
        <path d="M15 9l9 7 9-7" fill="none" stroke={A} strokeWidth="2" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

function Activity() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      {/* handset */}
      <path d="M14 8c-2 0-5 2-5 5 0 13 13 26 26 26 3 0 5-3 5-5l-7-5-4 3c-5-2-10-7-12-12l3-4-6-8z" fill={A} className="ico-handset" />
      {/* ring waves */}
      <path d="M29 11a9 9 0 0 1 8 8" fill="none" stroke={B} strokeWidth="2.5" strokeLinecap="round" className="ico-wave ico-wave-1" />
      <path d="M30 5a15 15 0 0 1 13 13" fill="none" stroke={B} strokeWidth="2.5" strokeLinecap="round" className="ico-wave ico-wave-2" />
    </svg>
  );
}

function Conversations() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M6 8h22a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H16l-7 6v-6H6a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4z" fill={A} />
      <g fill="#fff" className="ico-dots ico-dots-1">
        <circle cx="11" cy="17" r="2" />
        <circle cx="17" cy="17" r="2" />
        <circle cx="23" cy="17" r="2" />
      </g>
      <path d="M42 20H22a4 4 0 0 0-4 4v10a4 4 0 0 0 4 4h12l7 6v-6h1a4 4 0 0 0 4-4V24a4 4 0 0 0-4-4z" fill={B} />
      <g fill="#fff" className="ico-dots ico-dots-2">
        <circle cx="26" cy="29" r="2" />
        <circle cx="32" cy="29" r="2" />
        <circle cx="38" cy="29" r="2" />
      </g>
    </svg>
  );
}

function Appointments() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect x="6" y="10" width="36" height="32" rx="4" fill="#fff" stroke={L} strokeWidth="2" />
      <rect x="6" y="10" width="36" height="10" rx="4" fill={A} />
      <rect x="6" y="16" width="36" height="4" fill={A} />
      <rect x="13" y="5" width="4" height="9" rx="2" fill={L} />
      <rect x="31" y="5" width="4" height="9" rx="2" fill={L} />
      <path d="M15 31l6 6 12-13" fill="none" stroke={B} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="ico-check" />
    </svg>
  );
}

function Leads() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 16v8M24 24H12v6M24 24h12v6" fill="none" stroke={L} strokeWidth="2" pathLength={1} className="ico-link" />
      <g className="ico-node ico-node-1">
        <circle cx="24" cy="10" r="6" fill={A} />
      </g>
      <g className="ico-node ico-node-2">
        <circle cx="12" cy="36" r="6" fill={B} />
      </g>
      <g className="ico-node ico-node-3">
        <circle cx="36" cy="36" r="6" fill={B} />
      </g>
    </svg>
  );
}

function Won() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      {/* piggy bank */}
      <path d="M12 24c0-6 6-10 14-10s14 4 14 10c0 3-1 5-3 7v5h-5l-1-3h-8l-1 3h-5v-5c-3-2-5-4-5-7z" fill={B} />
      <circle cx="33" cy="22" r="1.6" fill="#000" opacity="0.5" />
      <rect x="20" y="13" width="9" height="2.5" rx="1" fill="rgba(0,0,0,0.35)" className="ico-pslot" />
      <path d="M8 22l4 2v4l-4 1z" fill={B} />
      {/* coin dropping */}
      <g className="ico-coin">
        <circle cx="24.5" cy="7" r="5" fill={A} stroke="#fff" strokeWidth="1.5" />
        <text x="24.5" y="9.6" textAnchor="middle" fontSize="7" fontWeight="800" fill="#fff" fontFamily="inherit">
          $
        </text>
      </g>
    </svg>
  );
}

const ICONS: Record<SectionIconName, () => React.JSX.Element> = { submissions: Submissions, activity: Activity, conversations: Conversations, appointments: Appointments, leads: Leads, won: Won };

export default function SectionIcon({ name, size = 44, className = "" }: { name: SectionIconName; size?: number; className?: string }) {
  const Icon = ICONS[name];
  return (
    <span className={`sec-icon sec-icon-${name} ${className}`.trim()} style={{ width: size, height: size }}>
      <Icon />
    </span>
  );
}
