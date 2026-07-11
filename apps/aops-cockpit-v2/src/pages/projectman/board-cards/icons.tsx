import { useEffect, useRef, useState, type ReactNode } from "react";

// ---- Icons (aops-desktop projectman icon grammar: viewBox 24, stroke 1.6) ----

function CardIcon({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const SparkIcon = (
  <CardIcon>
    <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
  </CardIcon>
);
export const UpIcon = (
  <CardIcon>
    <path d="m6 15 6-6 6 6" />
  </CardIcon>
);
export const DownIcon = (
  <CardIcon>
    <path d="m6 9 6 6 6-6" />
  </CardIcon>
);
export const EditIcon = (
  <CardIcon>
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </CardIcon>
);
export const FunnelIcon = (
  <CardIcon>
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </CardIcon>
);
export const SearchIcon = (
  <CardIcon>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </CardIcon>
);
export const CloseIcon = (
  <CardIcon>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </CardIcon>
);
// Mode shortcut icons (same grammar as the tree icon bar shortcuts).
export const NavigatorModeIcon = (
  <CardIcon>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M8.5 3v18" />
  </CardIcon>
);
export const LeftMenuModeIcon = (
  <CardIcon>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M10 5v14" />
    <path d="M5.4 9h2.4M5.4 12h2.4" />
  </CardIcon>
);
export const KebabIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="5" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
  </svg>
);
export const ArchiveIcon = (
  <CardIcon>
    <rect x="3" y="4" width="18" height="5" rx="1" />
    <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" />
    <path d="M10 13h4" />
  </CardIcon>
);
export const TrashIcon = (
  <CardIcon>
    <path d="M3 6h18" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    <path d="M6 6l1 14h10l1-14" />
  </CardIcon>
);

// aops-desktop FavoriteStarIcon — outline when idle, filled when favorited.
export function FavoriteStarIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3.8 2.63 5.34 5.89.86-4.26 4.15 1 5.85L12 17.22 6.74 20l1-5.85-4.26-4.15 5.89-.86L12 3.8Z" />
    </svg>
  );
}

// aops-desktop BoardToggleIcon: minus when expanded, plus when collapsed.
export function BoardToggleIcon({ expanded = false }: { expanded?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
      <path d="M3.5 8h9" />
      {!expanded ? <path d="M8 3.5v9" /> : null}
    </svg>
  );
}

// Shared popover chrome: closes on outside pointer-down / Escape.
export function usePopover() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, rootRef };
}
