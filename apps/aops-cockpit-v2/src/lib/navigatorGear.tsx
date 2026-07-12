import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Shared "View settings" gear for the workbench navigators (projects / chat /
// PM records). Opens a portaled dropdown with ONE labelled group: Mode, as a
// VERTICAL radio list (a horizontal switch overflowed the popover once a 4th
// "Cards" mode arrived). The old Layout (Stacked/Inline) switch is retired —
// the tree toolrow is always stacked. Portaled to <body> so it is not clipped
// by the navigator dock's many overflow:hidden ancestors. Closes on
// outside-click / Escape / scroll / resize.

// eops "View settings" gear (lucide settings cog) — verbatim from eops-desktop.
function GearIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export interface NavigatorSettingsGearProps {
  mode: string;
  onModeChange: (next: string) => void;
  /** Localized copy (defaults to the eops English labels). */
  title?: string;
  modeLabel?: string;
  navigatorLabel?: string;
  showNavigatorOption?: boolean;
  leftMenuLabel?: string;
  showLeftMenuOption?: boolean;
  /** When set, a 3rd Mode option ("Dropdown") is offered. onModeChange receives
   *  "dropdown"; the consumer renders a searchable dropdown instead of a tree. */
  dropdownLabel?: string;
  /** When set, a 4th Mode option ("Cards") is offered. onModeChange receives
   *  "cards"; the consumer renders a content-wide card register instead. */
  cardsLabel?: string;
  modeOrder?: ReadonlyArray<"navigator" | "left-menu" | "dropdown" | "cards">;
  /** Distinguish the consumers' test ids (projects / chat / boards). */
  testIdPrefix?: string;
}

export function NavigatorSettingsGear({
  mode,
  onModeChange,
  title = "View settings",
  modeLabel = "Mode",
  navigatorLabel = "Navigator",
  showNavigatorOption = true,
  leftMenuLabel = "Left menu",
  showLeftMenuOption = true,
  dropdownLabel,
  cardsLabel,
  modeOrder,
  testIdPrefix = "aops-v2"
}: NavigatorSettingsGearProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const openMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      // Clamp with the menu's real rendered width (the shared eops settings-menu
      // CSS keeps a 304px min-width) so a far-right gear never overflows.
      const width = 304;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      setCoords({ top: Math.round(rect.bottom + 6), left: Math.round(left) });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onReflow = () => setOpen(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open]);

  const selectMode = (next: string) => {
    setOpen(false);
    onModeChange(next);
  };
  const availableModeOptions = [
    ...(showNavigatorOption
      ? [{ value: "navigator", label: navigatorLabel, active: mode === "navigator", onSelect: () => selectMode("navigator"), testId: `${testIdPrefix}-mode-navigator` }]
      : []),
    ...(showLeftMenuOption
      ? [{ value: "left-menu", label: leftMenuLabel, active: mode === "left-menu", onSelect: () => selectMode("left-menu"), testId: `${testIdPrefix}-mode-leftmenu` }]
      : []),
    ...(dropdownLabel
      ? [{ value: "dropdown", label: dropdownLabel, active: mode === "dropdown", onSelect: () => selectMode("dropdown"), testId: `${testIdPrefix}-mode-dropdown` }]
      : []),
    ...(cardsLabel
      ? [{ value: "cards", label: cardsLabel, active: mode === "cards", onSelect: () => selectMode("cards"), testId: `${testIdPrefix}-mode-cards` }]
      : [])
  ];
  const modeOptions = modeOrder
    ? modeOrder.flatMap((orderedMode) =>
        availableModeOptions.filter((option) => option.value === orderedMode)
      )
    : availableModeOptions;
  return (
    <div className="inv-iv3-cattree-settings">
      <button
        ref={buttonRef}
        type="button"
        className={`inv-iv3-cattree-tool-btn${open ? " is-active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={title}
        title={title}
        onClick={() => (open ? setOpen(false) : openMenu())}
        data-testid={`${testIdPrefix}-tree-settings`}
      >
        <GearIcon />
      </button>
      {open
        ? createPortal(
            <div
              ref={popoverRef}
              className="inv-iv3-cattree-settings-menu aops-v2-settings-menu"
              role="menu"
              style={{ position: "fixed", top: coords.top, left: coords.left }}
              data-testid={`${testIdPrefix}-tree-settings-menu`}
            >
              <p className="inv-iv3-cattree-settings-title">{title}</p>
              <div className="inv-iv3-cattree-settings-body">
                <div className="aops-v2-settings-radiogroup" role="radiogroup" aria-label={modeLabel}>
                  <span className="inv-iv3-cattree-settings-label">{modeLabel}</span>
                  {modeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={option.active}
                      className={`aops-v2-settings-radio${option.active ? " is-active" : ""}`}
                      onClick={option.onSelect}
                      data-testid={option.testId}
                    >
                      <span className="aops-v2-settings-radio-dot" aria-hidden />
                      <span className="aops-v2-settings-radio-label">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
