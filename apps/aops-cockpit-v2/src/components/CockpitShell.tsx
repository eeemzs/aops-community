import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppShell,
  DESKTOP_SHELL_ICONS,
  DesktopSidebar,
  ShellAppearanceControls,
  ShellHeader,
  ShellMain,
  ShellSecondaryPanelHost,
  ShellSkipLink,
  type AppShellNavState,
  type DesktopSidebarNavLabels,
  type ShellAppearanceAccentOption,
  type ShellAppearanceThemeOption,
  type SidebarItem
} from "@aopslab/xf-ui-shell-react";
import type { AopsCockpitTranslationKey } from "../lib/i18n";
import type { CockpitViewport } from "../lib/viewport";

const ICONS = DESKTOP_SHELL_ICONS;

const DRAWER_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

function visibleFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(DRAWER_FOCUSABLE_SELECTOR)).filter(
    (element) => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true"
  );
}

function trapDrawerFocus(event: KeyboardEvent, container: HTMLElement | null): void {
  if (event.key !== "Tab" || !container) return;
  const focusable = visibleFocusableElements(container);
  if (!focusable.length) {
    event.preventDefault();
    container.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !container.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !container.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

function sidebarBranchContainsPage(item: SidebarItem, pageId: string): boolean {
  return Boolean(
    item.children?.some(
      (child) => child.id === pageId || sidebarBranchContainsPage(child, pageId)
    )
  );
}

function sidebarPathForPage(items: SidebarItem[], pageId: string): SidebarItem[] | null {
  for (const item of items) {
    if (item.id === pageId) return [item];
    const childPath = item.children ? sidebarPathForPage(item.children, pageId) : null;
    if (childPath) return [item, ...childPath];
  }
  return null;
}

/** Header-left product mark with a discreet beta status line. */
function ProdMark() {
  return (
    <span className="cockpit-prodmark">
      <span className="cockpit-prodmark__name">
        aops<span className="cockpit-prodmark__dot">·</span>
        <span className="cockpit-prodmark__c2">cockpit</span>
      </span>
      <span className="cockpit-prodmark__beta">Beta</span>
    </span>
  );
}

function HeaderNavStateIcon({
  currentState,
  nextState
}: {
  currentState: AppShellNavState;
  nextState: AppShellNavState;
}) {
  const dividerX = nextState === "expanded" ? 9 : nextState === "collapsed" ? 6.5 : null;
  return (
    <span
      className="cockpit-header-nav-cycle__glyph"
      data-icon-state={nextState}
      aria-hidden="true"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        {dividerX !== null ? (
          <>
            <rect x="3" y="3" width="18" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
            <rect
              x="4.5"
              y="4.5"
              width={nextState === "expanded" ? "4.5" : "2"}
              height="15"
              rx="0.8"
              fill="currentColor"
              opacity="0.2"
            />
            <path d={`M${dividerX} 3v18`} stroke="currentColor" strokeWidth="1.6" />
          </>
        ) : (
          <path
            d="M6.5 6.5l11 11M17.5 6.5l-11 11"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        )}
      </svg>
      <span className="cockpit-header-nav-cycle__states">
        <i className={currentState === "expanded" ? "is-active" : undefined} />
        <i className={currentState === "collapsed" ? "is-active" : undefined} />
        <i className={currentState === "hidden" ? "is-active" : undefined} />
      </span>
    </span>
  );
}

function HeaderNavCycleControl({
  navMode,
  navLabels,
  navReopenLabel,
  onSetNavMode
}: {
  navMode: AppShellNavState;
  navLabels: DesktopSidebarNavLabels;
  navReopenLabel: string;
  onSetNavMode: (mode: AppShellNavState) => void;
}) {
  const nextMode: AppShellNavState =
    navMode === "expanded" ? "collapsed" : navMode === "collapsed" ? "hidden" : "expanded";
  const nextActionLabel =
    navMode === "expanded"
      ? navLabels.collapse
      : navMode === "collapsed"
        ? navLabels.hide
        : navReopenLabel;
  const stateLabel = `${navLabels.headerControls}: ${nextActionLabel}`;

  return (
    <button
      className="cockpit-header-nav-cycle"
      type="button"
      onClick={() => onSetNavMode(nextMode)}
      aria-label={stateLabel}
      aria-controls="cockpit-primary-navigation"
      title={stateLabel}
      data-state={navMode}
      data-next-state={nextMode}
      data-testid="cockpit-nav-cycle"
    >
      <HeaderNavStateIcon currentState={navMode} nextState={nextMode} />
    </button>
  );
}

export interface CockpitShellProps {
  viewport: CockpitViewport;
  compactDensity: boolean;
  navItems: SidebarItem[];
  activePage: string;
  onNavigate: (item: SidebarItem) => void;
  onToggleBranch: (item: SidebarItem) => void;
  navMode: AppShellNavState;
  onSetNavMode: (mode: AppShellNavState) => void;
  // Localized labels for the shared DesktopSidebar header controls + reopen
  navLabels: DesktopSidebarNavLabels;
  navReopenLabel: string;
  // Shell-attached navigator (left dock): a page hands its navigator here so it
  // renders in the far-left workbench dock host (navigator mode). Hidden when a
  // page has no navigator or is in inline left-menu mode.
  leftDock?: ReactNode;
  leftDockMode?: "hidden" | "overlay" | "pinned";
  leftDockWidth?: number | string | null;
  // Shell thin bar (the strip between the header and the main/dock row): a page
  // hands a full-width top rail here (e.g. the projects recents bar) so it sits
  // above both the navigator dock and the page content (eops top-rail parity).
  thinBar?: ReactNode;
  // Appearance (snapshot-driven — eops theme model)
  appearanceStyle: CSSProperties;
  theme: string; // light/dark mode
  accent: string; // active variant id
  activeThemeId: string; // active named theme id
  themeOptions: ShellAppearanceThemeOption[];
  accentOptions: ShellAppearanceAccentOption[];
  onSetThemeId: (themeId: string) => void;
  onSetAccent: (accent: string) => void;
  onToggleTheme: () => void;
  onOpenThemeStudio?: () => void;
  authBar: ReactNode;
  statusBar: ReactNode;
  children: ReactNode;
  t: (key: AopsCockpitTranslationKey) => string;
}

/**
 * AOPS Cockpit v2 app shell — composed on the real xf-ui-shell primitives
 * (typed; no @ts-nocheck / eops-local wrappers). AppShell frame + collapsible
 * left Sidebar navigator + 3-zone header (prodmark · section switch · auth /
 * appearance) + main workbench + right inspector host + bottom status
 * bar. Appearance is snapshot-driven (eops theme model): `appearanceStyle`
 * (resolveShellAppearanceSnapshot().style) carries the theme tokens onto the
 * AppShell root, and theme/accent option lists come from the same snapshot.
 */
export function CockpitShell({
  viewport,
  compactDensity,
  navItems,
  activePage,
  onNavigate,
  onToggleBranch,
  navMode,
  onSetNavMode,
  navLabels,
  navReopenLabel,
  leftDock,
  leftDockMode = "hidden",
  leftDockWidth = null,
  thinBar = null,
  appearanceStyle,
  theme,
  accent,
  activeThemeId,
  themeOptions,
  accentOptions,
  onSetThemeId,
  onSetAccent,
  onToggleTheme,
  onOpenThemeStudio,
  authBar,
  statusBar,
  children,
  t
}: CockpitShellProps) {
  const isMobile = viewport === "mobile";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileDockOpen, setMobileDockOpen] = useState(false);
  const mobileNavTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileDockTriggerRef = useRef<HTMLButtonElement>(null);
  const accordionNormalizationRef = useRef<string | null>(null);
  const hasMobileDock = isMobile && leftDockMode === "pinned" && Boolean(leftDock);

  const expandedTopLevelBranches = useMemo(
    () => navItems.filter((item) => Boolean(item.children?.length) && item.expanded === true),
    [navItems]
  );
  const activeNavigationPath = useMemo(() => sidebarPathForPage(navItems, activePage) ?? [], [activePage, navItems]);
  const activeNavigationPrimary = activeNavigationPath[0]?.label ?? null;
  const activeNavigationSecondary =
    activeNavigationPath.length > 1 ? activeNavigationPath[activeNavigationPath.length - 1]?.label : null;

  useEffect(() => {
    if (expandedTopLevelBranches.length <= 1) {
      accordionNormalizationRef.current = null;
      return;
    }

    const branchToKeep =
      expandedTopLevelBranches.find((item) => sidebarBranchContainsPage(item, activePage)) ??
      expandedTopLevelBranches[0];
    if (!branchToKeep) return;
    const branchesToClose = expandedTopLevelBranches.filter((item) => item.id !== branchToKeep.id);
    const signature = `${branchToKeep.id}:${branchesToClose.map((item) => item.id).join(",")}`;
    if (accordionNormalizationRef.current === signature) return;
    accordionNormalizationRef.current = signature;
    branchesToClose.forEach((item) => onToggleBranch(item));
  }, [activePage, expandedTopLevelBranches, onToggleBranch]);

  const closeMobileNav = useCallback((restoreFocus = true) => {
    setMobileNavOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => mobileNavTriggerRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    if (!isMobile) setMobileNavOpen(false);
  }, [isMobile]);

  useEffect(() => {
    if (!hasMobileDock) setMobileDockOpen(false);
  }, [hasMobileDock]);

  useEffect(() => {
    setMobileDockOpen(false);
  }, [activePage]);

  useEffect(() => {
    if (!isMobile || !mobileNavOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMobileNav();
        return;
      }
      trapDrawerFocus(event, document.getElementById("cockpit-primary-navigation"));
    };
    document.addEventListener("keydown", handleKeyDown);
    const frame = window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>("#cockpit-primary-navigation .nav-item")
        ?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMobileNav, isMobile, mobileNavOpen]);

  useEffect(() => {
    if (!hasMobileDock || !mobileDockOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileDockOpen(false);
        window.requestAnimationFrame(() => mobileDockTriggerRef.current?.focus());
        return;
      }
      trapDrawerFocus(event, document.querySelector<HTMLElement>(".shell-workbench-dock-host[data-mode='pinned']"));
    };
    document.addEventListener("keydown", handleKeyDown);
    const frame = window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(".shell-workbench-dock-host button")
        ?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [hasMobileDock, mobileDockOpen]);

  const handleNavigate = useCallback(
    (item: SidebarItem) => {
      onNavigate(item);
      if (isMobile) closeMobileNav(false);
    },
    [closeMobileNav, isMobile, onNavigate]
  );

  const handleAccordionToggleBranch = useCallback(
    (item: SidebarItem) => {
      if (item.expanded === false) {
        expandedTopLevelBranches
          .filter((expandedItem) => expandedItem.id !== item.id)
          .forEach((expandedItem) => onToggleBranch(expandedItem));
      }
      onToggleBranch(item);
    },
    [expandedTopLevelBranches, onToggleBranch]
  );

  const appearanceControls = (
    <>
      {authBar}
      <ShellAppearanceControls
        accent={accent}
        accents={accentOptions}
        icons={ICONS}
        theme={theme}
        themeLabel={theme === "dark" ? t("themeDark") : t("themeLight")}
        themes={themeOptions}
        activeThemeId={activeThemeId}
        onSetAccent={onSetAccent}
        onSetThemeId={onSetThemeId}
        onToggleTheme={onToggleTheme}
        onOpenSettings={onOpenThemeStudio}
      />
    </>
  );

  return (
    <AppShell
      accent={accent}
      theme={theme}
      navState={navMode}
      data-viewport={viewport}
      data-density={compactDensity ? "compact" : "comfortable"}
      data-mobile-nav-open={mobileNavOpen ? "true" : "false"}
      data-mobile-dock-open={mobileDockOpen ? "true" : "false"}
      style={appearanceStyle}
      leftDock={leftDock}
      leftDockMode={leftDockMode}
      leftDockWidth={leftDockWidth}
      thinBar={thinBar}
    >
      <ShellSkipLink />
      <DesktopSidebar
        id="cockpit-primary-navigation"
        items={navItems}
        icons={ICONS}
        activePage={activePage}
        navMode={isMobile ? "expanded" : navMode}
        navLabels={navLabels}
        navHeaderControls={false}
        showNavEdgeTab={false}
        /* No whole-nav hover popover — collapsed submenus use the per-parent
           rail flyout (navPopoverEnabled=false activates it). */
        navPopoverEnabled={false}
        /* No brand/logo — the shared DesktopSidebar suppresses .nav-top when
           brand is null. The header controls (Full/Narrow + Close) come from
           the shared component. */
        brand={null}
        onNavigate={handleNavigate}
        onToggleBranch={handleAccordionToggleBranch}
        onSetNavMode={onSetNavMode}
      />
      {isMobile ? (
        <>
          <button
            type="button"
            className="cockpit-mobile-nav-backdrop"
            aria-label={navLabels.hide}
            aria-hidden={mobileNavOpen ? undefined : true}
            onClick={() => closeMobileNav()}
            tabIndex={mobileNavOpen ? 0 : -1}
          />
          {hasMobileDock ? (
            <button
              type="button"
              className="cockpit-mobile-dock-backdrop"
              aria-label={t("navPaneReopen")}
              aria-hidden={mobileDockOpen ? undefined : true}
              onClick={() => {
                setMobileDockOpen(false);
                window.requestAnimationFrame(() => mobileDockTriggerRef.current?.focus());
              }}
              tabIndex={mobileDockOpen ? 0 : -1}
            />
          ) : null}
        </>
      ) : null}
      <ShellHeader>
        <div className="cockpit-topbar">
          <div className="cockpit-topbar__left">
            {isMobile ? (
              <button
                ref={mobileNavTriggerRef}
                className="cockpit-mobile-nav-trigger"
                type="button"
                onClick={() => setMobileNavOpen((open) => !open)}
                aria-controls="cockpit-primary-navigation"
                aria-expanded={mobileNavOpen}
                aria-label={navReopenLabel}
                title={navReopenLabel}
                data-testid="cockpit-mobile-nav-trigger"
              >
                {ICONS.panelLeft ?? ICONS.menu ?? null}
              </button>
            ) : (
              <HeaderNavCycleControl
                navMode={navMode}
                navLabels={navLabels}
                navReopenLabel={navReopenLabel}
                onSetNavMode={onSetNavMode}
              />
            )}
            <ProdMark />
            {activeNavigationPrimary ? (
              <span className="cockpit-topbar-context">
                <span className="cockpit-topbar-context__primary">{activeNavigationPrimary}</span>
                {activeNavigationSecondary ? (
                  <>
                    <span className="cockpit-topbar-context__separator" aria-hidden="true">/</span>
                    <span className="cockpit-topbar-context__secondary">{activeNavigationSecondary}</span>
                  </>
                ) : null}
              </span>
            ) : null}
            {hasMobileDock ? (
              <button
                ref={mobileDockTriggerRef}
                className="cockpit-mobile-dock-trigger"
                type="button"
                onClick={() => setMobileDockOpen((open) => !open)}
                aria-expanded={mobileDockOpen}
                aria-label={t("navPaneReopen")}
                title={t("navPaneReopen")}
                data-testid="cockpit-mobile-dock-trigger"
              >
                {ICONS.layers ?? ICONS.panelLeft ?? null}
              </button>
            ) : null}
          </div>
          {isMobile ? (
            <details className="cockpit-mobile-actions">
              <summary aria-label={t("navHeaderControls")} title={t("navHeaderControls")}>
                {ICONS.moreVertical ?? ICONS.gear ?? null}
              </summary>
              <div className="cockpit-mobile-actions__panel">{appearanceControls}</div>
            </details>
          ) : (
            <div className="cockpit-topbar__right">{appearanceControls}</div>
          )}
        </div>
      </ShellHeader>
      <ShellMain id="main-content">
        {/* The secondary panel must live INSIDE .shell-main-frame as a sibling of
            .shell-main-page-stack (aops-cockpit RR a0b459c7). */}
        <div className="shell-main-frame">
          <div className="shell-main-page-stack">{children}</div>
          <ShellSecondaryPanelHost
            icons={{ close: ICONS.chevronLeft, chevronRight: ICONS.chevronRight }}
          />
        </div>
      </ShellMain>
      {/* statusBar is the DesktopStatusBar, which renders its own <footer
          class="statusbar"> (same grid slot ShellFooter would) — render it
          directly to avoid a nested double footer. */}
      {statusBar}
    </AppShell>
  );
}
