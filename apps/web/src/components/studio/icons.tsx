type P = { size?: number; className?: string };
const base = (size: number) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const });

/** Monitor with a dotted stand — the "Editor" view glyph. */
export const EditorIcon = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className} aria-hidden>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M7 20h.01M10 20h.01M14 20h.01M17 20h.01" strokeWidth="2.2" />
  </svg>
);

/** Stacked slivers + card — the "Feed" view glyph. */
export const FeedIcon = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className} aria-hidden>
    <path d="M3.5 7v10M7 5.5v13" />
    <rect x="10.5" y="4" width="10" height="16" rx="2" />
  </svg>
);

/** Three books leaning — Library. */
export const LibraryIcon = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className} aria-hidden>
    <path d="M5 4v16M9 4v16M13 4v16M16.5 4.5l3.5 15" />
  </svg>
);

/** Dashed frame with a subject — Remove background. */
export const BgRemoveIcon = ({ size = 17, className }: P) => (
  <svg {...base(size)} className={className} aria-hidden>
    <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
    <circle cx="12" cy="10" r="2.4" />
    <path d="M8 17c.6-2 2.2-3.2 4-3.2s3.4 1.2 4 3.2" />
    <path d="M4 12h.01M20 12h.01M12 4h.01" strokeWidth="2" />
  </svg>
);

/** Pin with slash — filmstrip unpinned/pinned toggle. */
export const PinToggleIcon = ({ size = 14, pinned, className }: P & { pinned: boolean }) => (
  <svg {...base(size)} className={className} aria-hidden>
    <path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6Z" />
    <path d="M12 15v5" />
    {!pinned && <path d="m3 3 18 18" />}
  </svg>
);
