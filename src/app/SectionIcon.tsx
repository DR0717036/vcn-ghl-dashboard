// Section icons drawn as macOS-style app tiles: a 64×64 rounded square with
// a brand gradient, a top-half gloss (white, ~25% at the top fading out by
// the middle), a 1px lighter inner line along the top edge, a faint darker
// inner shadow at the bottom, and a crisp symbol inside (2px-aligned
// strokes, consistent weight). Inline SVG only, no raster, so they stay
// sharp on Retina. The parts marked ico-* animate with CSS keyframes
// (base.css, "section icons"): once when a band heading scrolls into view
// (Motion.tsx adds "is-playing") and while hovered or focused in the dock.
// Server-renderable (no hooks). Gradient ids repeat across instances on
// purpose: they are identical, so any instance's definition serves all.

import type { SectionIconName } from "./sections";

const BLUE = ["#4d9bff", "#0f5fd1"];
const CYAN = ["#2fb6dc", "#077a9c"];
const TEAL = ["#2dd4bf", "#0f766e"];
const RED = ["#ef4444", "#b91c1c"];
const GREEN_WON = ["#22c55e", "#15803d"];
const GREEN_CONV = ["#34d399", "#059669"];
const GOLD = "#f7cf3a";

function Tile({ id, colors, children }: { id: string; colors: string[]; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="tile">
      <defs>
        <linearGradient id={`tile-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={colors[0]} />
          <stop offset="1" stopColor={colors[1]} />
        </linearGradient>
        <linearGradient id={`gloss-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.25" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`shade-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.6" stopColor="#000000" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.22" />
        </linearGradient>
        <clipPath id={`clip-${id}`}>
          <rect x="1" y="1" width="62" height="62" rx="15" />
        </clipPath>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="15" fill={`url(#tile-${id})`} />
      <rect x="1" y="1" width="62" height="62" rx="15" fill={`url(#shade-${id})`} />
      <rect x="1" y="1" width="62" height="62" rx="15" fill={`url(#gloss-${id})`} />
      {/* 1px lighter inner line along the top edge, inside the corner radius */}
      <path d="M14 2.5h36" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1" strokeLinecap="round" clipPath={`url(#clip-${id})`} />
      <rect x="1.5" y="1.5" width="61" height="61" rx="14.5" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
      {children}
    </svg>
  );
}

function Submissions() {
  return (
    <Tile id="sub" colors={BLUE}>
      {/* mailbox */}
      <rect x="14" y="32" width="36" height="20" rx="5" fill={GOLD} stroke="#9a7600" strokeWidth="2" />
      <rect x="22" y="37" width="20" height="4" rx="2" fill="#6b5200" className="ico-slot" />
      <rect x="29" y="52" width="6" height="6" rx="1" fill="#9a7600" />
      {/* envelope dropping into the slot */}
      <g className="ico-env">
        <rect x="20" y="13" width="24" height="16" rx="3" fill="#ffffff" stroke="#0f5fd1" strokeWidth="2" />
        <path d="M21 15l11 8 11-8" fill="none" stroke="#0f5fd1" strokeWidth="2" strokeLinejoin="round" />
      </g>
    </Tile>
  );
}

function Activity() {
  return (
    <Tile id="act" colors={CYAN}>
      {/* handset */}
      <path d="M19 12c-3 0-7 3-7 7 0 17 16 33 33 33 4 0 7-4 7-7l-9-6-5 4c-6-3-13-10-16-16l4-5-7-10z" fill="#ffffff" stroke="#055f7a" strokeWidth="2" strokeLinejoin="round" className="ico-handset" />
      {/* ring waves */}
      <path d="M38 17a9 9 0 0 1 9 9" fill="none" stroke={GOLD} strokeWidth="3" strokeLinecap="round" className="ico-wave ico-wave-1" />
      <path d="M40 9a17 17 0 0 1 15 15" fill="none" stroke={GOLD} strokeWidth="3" strokeLinecap="round" className="ico-wave ico-wave-2" />
    </Tile>
  );
}

function Conversations() {
  return (
    <Tile id="conv" colors={GREEN_CONV}>
      <path d="M10 12h26a5 5 0 0 1 5 5v12a5 5 0 0 1-5 5H22l-8 7v-7h-4a5 5 0 0 1-5-5V17a5 5 0 0 1 5-5z" fill="#ffffff" stroke="#047857" strokeWidth="2" strokeLinejoin="round" />
      <g fill="#059669" className="ico-dots ico-dots-1">
        <circle cx="16" cy="23" r="2.5" />
        <circle cx="23" cy="23" r="2.5" />
        <circle cx="30" cy="23" r="2.5" />
      </g>
      <path d="M54 28H30a5 5 0 0 0-5 5v12a5 5 0 0 0 5 5h12l8 7v-7h4a5 5 0 0 0 5-5V33a5 5 0 0 0-5-5z" fill="#ffffff" stroke="#047857" strokeWidth="2" strokeLinejoin="round" />
      <g fill="#059669" className="ico-dots ico-dots-2">
        <circle cx="35" cy="39" r="2.5" />
        <circle cx="42" cy="39" r="2.5" />
        <circle cx="49" cy="39" r="2.5" />
      </g>
    </Tile>
  );
}

function Appointments() {
  return (
    <Tile id="appt" colors={RED}>
      {/* white calendar: translucent page, solid white header, white rings and check */}
      <rect x="11" y="15" width="42" height="38" rx="5" fill="#ffffff" fillOpacity="0.28" stroke="#ffffff" strokeWidth="2" />
      <path d="M11 20a5 5 0 0 1 5-5h32a5 5 0 0 1 5 5v8H11z" fill="#ffffff" stroke="#ffffff" strokeWidth="2" />
      <rect x="19" y="9" width="4" height="12" rx="2" fill="#ffffff" stroke="#991b1b" strokeWidth="1" />
      <rect x="41" y="9" width="4" height="12" rx="2" fill="#ffffff" stroke="#991b1b" strokeWidth="1" />
      <path d="M21 41l7 7 15-16" fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="ico-check" />
    </Tile>
  );
}

function Leads() {
  return (
    <Tile id="leads" colors={TEAL}>
      <path d="M32 23v9M32 32H18v8M32 32h14v8" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" pathLength={1} className="ico-link" />
      <g className="ico-node ico-node-1">
        <circle cx="32" cy="16" r="7" fill="#ffffff" stroke="#0f766e" strokeWidth="2" />
        <circle cx="32" cy="14" r="2.5" fill="#0f766e" />
        <path d="M27 20a5 5 0 0 1 10 0" fill="#0f766e" />
      </g>
      <g className="ico-node ico-node-2">
        <circle cx="18" cy="47" r="7" fill={GOLD} stroke="#8a6a00" strokeWidth="2" />
        <circle cx="18" cy="45" r="2.5" fill="#8a6a00" />
        <path d="M13 51a5 5 0 0 1 10 0" fill="#8a6a00" />
      </g>
      <g className="ico-node ico-node-3">
        <circle cx="46" cy="47" r="7" fill={GOLD} stroke="#8a6a00" strokeWidth="2" />
        <circle cx="46" cy="45" r="2.5" fill="#8a6a00" />
        <path d="M41 51a5 5 0 0 1 10 0" fill="#8a6a00" />
      </g>
    </Tile>
  );
}

function Won() {
  return (
    <Tile id="won" colors={GREEN_WON}>
      {/* piggy bank in white with a gold outline */}
      <path d="M17 34c0-8 7-13 16-13s16 5 16 13c0 4-2 7-4 9v6h-6l-2-4h-8l-2 4h-6v-6c-3-2-4-5-4-9z" fill="#ffffff" stroke="#c99a00" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="43" cy="31" r="2" fill="#c99a00" />
      <rect x="27" y="22" width="12" height="3" rx="1.5" fill="#c99a00" className="ico-pslot" />
      <path d="M13 31l5 2v5l-5 1z" fill="#ffffff" stroke="#c99a00" strokeWidth="2" strokeLinejoin="round" />
      {/* gold coin dropping */}
      <g className="ico-coin">
        <circle cx="33" cy="11" r="6" fill={GOLD} stroke="#ffffff" strokeWidth="2" />
        <path d="M33 7.5v7M31 9.5h3.5a1.25 1.25 0 0 1 0 2.5h-3a1.25 1.25 0 0 0 0 2.5H35" fill="none" stroke="#8a6a00" strokeWidth="1.5" strokeLinecap="round" />
      </g>
    </Tile>
  );
}

function Reps() {
  return (
    <Tile id="reps" colors={["#f7cf3a", "#1677ff"]}>
      {/* person */}
      <g className="ico-person">
        <circle cx="23" cy="22" r="8" fill="#ffffff" stroke="#0f5fd1" strokeWidth="2" />
        <path d="M9 50c0-9 6-14 14-14s14 5 14 14v3H9z" fill="#ffffff" stroke="#0f5fd1" strokeWidth="2" strokeLinejoin="round" />
      </g>
      {/* small bar chart */}
      <rect x="40" y="38" width="5" height="15" rx="1.5" fill="#ffffff" className="ico-bar ico-bar-1" />
      <rect x="47" y="30" width="5" height="23" rx="1.5" fill="#ffffff" className="ico-bar ico-bar-2" />
      <rect x="54" y="22" width="5" height="31" rx="1.5" fill="#ffffff" className="ico-bar ico-bar-3" />
      <path d="M38 54h22" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
    </Tile>
  );
}

const ICONS: Record<SectionIconName, () => React.JSX.Element> = { submissions: Submissions, activity: Activity, conversations: Conversations, appointments: Appointments, leads: Leads, won: Won, reps: Reps };

export default function SectionIcon({ name, size = 44, className = "" }: { name: SectionIconName; size?: number | string; className?: string }) {
  const Icon = ICONS[name];
  return (
    <span className={`sec-icon sec-icon-${name} ${className}`.trim()} style={{ width: size, height: size }}>
      <Icon />
    </span>
  );
}
