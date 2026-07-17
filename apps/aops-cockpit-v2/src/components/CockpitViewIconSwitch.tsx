import type { ReactNode } from "react";

export type CockpitViewIconKind =
  | "side-panel"
  | "cards"
  | "dropdown"
  | "timeline"
  | "read"
  | "digest";

export interface CockpitViewIconItem<T extends string> {
  value: T;
  label: string;
  icon: CockpitViewIconKind;
  expanded?: boolean;
  onSelect?: () => void;
  testId?: string;
}

export function CockpitViewIconSwitch<T extends string>({
  ariaLabel,
  value,
  items,
  onChange,
  className = ""
}: {
  ariaLabel: string;
  value: T;
  items: ReadonlyArray<CockpitViewIconItem<T>>;
  onChange: (value: T) => void;
  className?: string;
}): ReactNode {
  return (
    <div className={`aops-pm-section-view-switch is-icon-only${className ? ` ${className}` : ""}`}>
      <div className="aops-pm-view-icon-group" role="group" aria-label={ariaLabel}>
        {items.map((item) => {
          const selected = value === item.value;
          return (
            <button
              key={item.value}
              type="button"
              className={item.icon === "side-panel" && item.expanded ? "is-panel-open" : ""}
              aria-label={item.label}
              title={item.label}
              aria-pressed={selected}
              aria-expanded={item.icon === "side-panel" ? Boolean(item.expanded) : undefined}
              onClick={item.onSelect ?? (() => onChange(item.value))}
              data-testid={item.testId}
            >
              <CockpitViewIcon kind={item.icon} panelOpen={item.expanded} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CockpitViewIcon({
  kind,
  panelOpen = false
}: {
  kind: CockpitViewIconKind;
  panelOpen?: boolean;
}): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      width={kind === "cards" ? 16 : 17}
      height={kind === "cards" ? 16 : 17}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "side-panel" ? (
        <>
          <rect x="2.75" y="4" width="18.5" height="16" rx="2.25" />
          <path d="M9.25 4.25v15.5" />
          <path
            d="M3.5 5.25h5v13.5h-5z"
            fill="currentColor"
            fillOpacity={panelOpen ? 0.2 : 0.1}
            stroke="none"
          />
          <path d={panelOpen ? "m16.25 9-3 3 3 3" : "m13 9 3 3-3 3"} strokeWidth={2} />
        </>
      ) : kind === "cards" ? (
        <>
          <rect x="4" y="4" width="16" height="6" rx="1.5" />
          <rect x="4" y="14" width="16" height="6" rx="1.5" />
        </>
      ) : kind === "dropdown" ? (
        <>
          <rect x="3" y="6" width="18" height="12" rx="2.5" />
          <path d="M7 12h6" />
          <path d="m15 10.5 2.25 2.75 2.25-2.75" fill="currentColor" stroke="none" />
        </>
      ) : kind === "timeline" ? (
        <>
          <path d="M5 5v14" />
          <circle cx="5" cy="7" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="5" cy="17" r="1.6" fill="currentColor" stroke="none" />
          <path d="M9 7h10M9 12h7M9 17h9" />
        </>
      ) : kind === "read" ? (
        <>
          <path d="M4 5.5c3.2-.9 5.9-.4 8 1.4v12c-2.1-1.8-4.8-2.3-8-1.4z" />
          <path d="M20 5.5c-3.2-.9-5.9-.4-8 1.4v12c2.1-1.8 4.8-2.3 8-1.4z" />
        </>
      ) : (
        <>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M8 9h8M8 13h8M8 17h5" />
        </>
      )}
    </svg>
  );
}

export function CockpitPanelCloseIcon(): ReactNode {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
