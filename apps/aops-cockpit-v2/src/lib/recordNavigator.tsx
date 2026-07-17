import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  NavigatorCategoryIconBar,
  NavigatorLeftMenuButton,
  NavigatorTreePanel,
  ProjectScopeNavigatorLabel,
  useWorkbenchNavigator,
  WorkbenchNavigator,
  type NavigatorTreeRow
} from "@aopslab/xf-ui-composition-react";
import { NavigatorSettingsGear } from "./navigatorGear";
import type { AopsCockpitTranslationKey } from "./i18n";

type NavT = (key: AopsCockpitTranslationKey) => string;

// Mode shortcut icons (viewBox 24, stroke 1.6): navigator = shell dock panel,
// left-menu = in-section split with rows, cards = stacked wide cards.
function ModeIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
const NavigatorModeIcon = (
  <ModeIcon>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M8.5 3v18" />
  </ModeIcon>
);
const LeftMenuModeShortcutIcon = (
  <ModeIcon>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M10 5v14" />
    <path d="M5.4 9h2.4M5.4 12h2.4" />
  </ModeIcon>
);
const CardsModeIcon = (
  <ModeIcon>
    <rect x="4" y="4" width="16" height="7" rx="1.5" />
    <rect x="4" y="13" width="16" height="7" rx="1.5" />
  </ModeIcon>
);

const CloseTreePanelIcon = (
  <svg
    viewBox="0 0 24 24"
    width="15"
    height="15"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

// Generic record navigator (Projects-page parity) shared by the PM
// Boards + Sprints navigators (and future Agentspace/Docman record lists):
//   • left-menu : inline tree in the section (master-detail)
//   • navigator : shell-attached far-left dock
//   • dropdown  : compact searchable dropdown + gear at the content top-left
//   • cards     : no navigator chrome at all — the consumer renders the whole
//                 record set as a content-wide card register (opt-in via
//                 config.enableCardsMode; only Boards offers it today)
// The dropdown/cards modes are v2-local (the shared controller only knows
// navigator / left-menu); we track them beside the shared controller and
// render accordingly.
// Consumers describe their record shape via RecordNavigatorConfig; group rows
// collapse/expand, search filters leaves and force-expands matching groups.

const GROUP_PREFIX = "grp:";

export interface RecordNavGroup<T> {
  key: string;
  label: string;
  items: T[];
}

export interface RecordNavigatorLabels {
  /** Dock panel title (e.g. Boards / Sprints & Plans). */
  panelTitle: AopsCockpitTranslationKey;
  paneAria: AopsCockpitTranslationKey;
  toolsAria: AopsCockpitTranslationKey;
  searchPlaceholder: AopsCockpitTranslationKey;
  searchAria: AopsCockpitTranslationKey;
  empty: AopsCockpitTranslationKey;
  emptySearch: AopsCockpitTranslationKey;
  unclassified: AopsCockpitTranslationKey;
  /** Dropdown trigger kicker (e.g. Board / Sprint). */
  dropdownKicker: AopsCockpitTranslationKey;
  /** Dropdown trigger fallback when nothing is selected. */
  dropdownSelect: AopsCockpitTranslationKey;
}

export interface RecordNavigatorConfig<T> {
  /** localStorage prefix, e.g. "aops-cockpit-v2.boards" (keys stay stable). */
  storagePrefix: string;
  /** data-testid prefix, e.g. "aops-v2-boards" (Playwright contract). */
  testIdPrefix: string;
  dockClassName: string;
  /** Optional scope class for record-specific tree styling. */
  treeClassName?: string;
  /** Omit the branch row when only one non-empty group is visible. */
  flattenSingleGroup?: boolean;
  /** Enable persistent, selectable favorite chips for record rows. */
  enableFavorites?: boolean;
  /** Optional control rendered at the far edge of the tree search field. */
  searchTrailingSlot?: ReactNode;
  /** Offer the 4th "cards" view mode in the gear (card-register consumers). */
  enableCardsMode?: boolean;
  /** Keep the legacy mode gear beside the dropdown selector. Defaults to true. */
  showDropdownSettings?: boolean;
  /** Show itemMeta as a secondary dropdown column. Defaults to true. */
  showDropdownMeta?: boolean;
  /** Show mode shortcut icons in the tree toolbar. Defaults to true. */
  showModeShortcuts?: boolean;
  /** Keep the legacy settings gear in the tree toolbar. Defaults to true. */
  showTreeSettings?: boolean;
  /** Add a far-edge action that closes the inline tree panel. */
  showTreeClose?: boolean;
  /** Accessible label for the inline tree close action. */
  treeCloseLabel?: AopsCockpitTranslationKey;
  /** Offer the shell Navigator mode in settings. Defaults to true. */
  showNavigatorSetting?: boolean;
  /** Override the settings label for the inline left-menu mode. */
  leftMenuModeLabel?: AopsCockpitTranslationKey;
  /** Align settings mode order with a page-level view switch. */
  settingsModeOrder?: ReadonlyArray<RecordNavigator["viewMode"]>;
  /** Cards-mode change mirror (consumers defer heavy queries while in cards). */
  onCardsModeChange?: (cards: boolean) => void;
  labels: RecordNavigatorLabels;
  /** Trigger icon for the dropdown pill. */
  dropdownIcon: ReactNode;
  /** Group the (already sorted) records; empty groups are skipped. */
  groups: Array<RecordNavGroup<T>>;
  itemKey: (item: T) => string;
  itemLabel: (item: T) => string;
  /** Optional secondary meta lines under the tree row / dropdown row. */
  itemMeta?: (item: T) => string[] | undefined;
  /** Search haystack per item (lowercased match). */
  searchText: (item: T) => string;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

export interface RecordNavigator {
  viewMode: "left-menu" | "navigator" | "dropdown" | "cards";
  /** Shared workbench controller (drives WorkbenchRecordDetailLayout). */
  controller: ReturnType<typeof useWorkbenchNavigator>;
  /** Bare tree for the in-section left-menu split. */
  treePanel: ReactNode;
  /** Shell-attached far-left dock (navigator mode). */
  dockNode: ReactNode;
  /** Searchable dropdown for the content top-left (optional legacy mode gear). */
  dropdownNode: ReactNode;
  /** Re-open launcher for the shell dock when unpinned/closed (navigator mode). */
  launcherNode: ReactNode;
  /** The mode gear alone (cards mode hosts it in its own toolbar). */
  gearNode: ReactNode;
  isLeftMenuMode: boolean;
  isDropdownMode: boolean;
  isCardsMode: boolean;
  /** Programmatic record selection (cards register → App-owned selection). */
  selectRecord: (key: string) => void;
  /** Programmatic mode switch (shortcut buttons outside the gear). */
  switchMode: (mode: RecordNavigator["viewMode"]) => void;
  openNavigator: () => void;
  leftDockMode: "hidden" | "overlay" | "pinned";
  leftDockWidth: number;
}

type RecordNavRow = NavigatorTreeRow;

function buildRows<T>(
  config: RecordNavigatorConfig<T>,
  collapsed: Set<string>,
  search: string
): { rows: RecordNavRow[]; counts: Record<string, { total: number }> } {
  const query = search.trim().toLowerCase();
  const rows: RecordNavRow[] = [];
  const counts: Record<string, { total: number }> = {};
  const nonEmptyGroups = config.groups.filter((group) => group.items.length > 0);
  const visibleGroups = nonEmptyGroups
    .map((group) => ({
      ...group,
      matched: query
        ? group.items.filter((item) => config.searchText(item).toLowerCase().includes(query))
        : group.items
    }))
    .filter((group) => !query || group.matched.length > 0);
  const flattenGroup = Boolean(config.flattenSingleGroup) && nonEmptyGroups.length === 1;
  for (const group of visibleGroups) {
    const groupKey = `${GROUP_PREFIX}${group.key}`;
    counts[groupKey] = { total: group.items.length };
    const isExpanded = query ? true : !collapsed.has(groupKey);
    if (!flattenGroup) {
      rows.push({
        categoryUid: groupKey,
        depth: 0,
        hasChildren: true,
        isExpanded,
        label: group.label,
        hideDefaultMeta: true
      });
    }
    if (!flattenGroup && !isExpanded) continue;
    for (const item of group.matched) {
      rows.push({
        categoryUid: config.itemKey(item),
        depth: flattenGroup ? 0 : 1,
        hasChildren: false,
        label: config.itemLabel(item),
        hideDefaultMeta: true,
        metaLines: config.itemMeta?.(item)
      });
    }
  }
  return { rows, counts };
}

function readStoredFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeStoredFlag(key: string, value: boolean): void {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function readStoredStringSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const stored = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return new Set(Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set();
  }
}

function writeStoredStringSet(key: string, values: ReadonlySet<string>): void {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify([...values]));
  } catch {
    /* ignore */
  }
}

export function useRecordNavigator<T>(config: RecordNavigatorConfig<T>, t: NavT): RecordNavigator {
  const dropdownStorageKey = `${config.storagePrefix}.dropdownMode`;
  const cardsStorageKey = `${config.storagePrefix}.cardsMode`;
  const favoritesStorageKey = `${config.storagePrefix}.favorites.v1`;
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [dropdownMode, setDropdownMode] = useState<boolean>(() => readStoredFlag(dropdownStorageKey));
  const [cardsMode, setCardsMode] = useState<boolean>(
    () => Boolean(config.enableCardsMode) && readStoredFlag(cardsStorageKey)
  );
  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(
    () => config.enableFavorites ? readStoredStringSet(favoritesStorageKey) : new Set()
  );
  const nav = useWorkbenchNavigator({
    storageKeys: {
      mode: `${config.storagePrefix}.navMode`,
      open: `${config.storagePrefix}.navOpen`,
      pinned: `${config.storagePrefix}.navPinned`,
      navigatorWidth: `${config.storagePrefix}.navWidth`,
      leftMenuWidth: `${config.storagePrefix}.leftMenuWidth`
    },
    defaultMode: "left-menu",
    defaultOpen: true,
    defaultPinned: true,
    defaultNavigatorWidth: 340,
    defaultLeftMenuWidth: 300,
    leftMenuMinWidth: 240,
    leftMenuMaxWidth: 460
  });

  const { rows, counts } = useMemo(() => buildRows(config, collapsed, search), [config, collapsed, search]);
  const allGroups = useMemo(
    () => {
      const groups = config.groups.filter((group) => group.items.length > 0);
      if (config.flattenSingleGroup && groups.length === 1) return new Set<string>();
      return new Set(groups.map((group) => `${GROUP_PREFIX}${group.key}`));
    },
    [config.flattenSingleGroup, config.groups]
  );
  const totalItemCount = useMemo(
    () => config.groups.reduce((count, group) => count + group.items.length, 0),
    [config.groups]
  );
  const itemByKey = useMemo(() => {
    const items = new Map<string, T>();
    for (const group of config.groups) {
      for (const item of group.items) items.set(config.itemKey(item), item);
    }
    return items;
  }, [config.groups, config.itemKey]);
  const favoriteEntries = useMemo(
    () => [...favoriteKeys]
      .map((key) => {
        const item = itemByKey.get(key);
        if (!item) return null;
        return {
          categoryUid: key,
          label: config.itemLabel(item),
          pathText: config.itemMeta?.(item)?.join(" · ") || config.itemLabel(item)
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    [config.itemLabel, config.itemMeta, favoriteKeys, itemByKey]
  );

  const persistDropdown = useCallback(
    (next: boolean) => {
      setDropdownMode(next);
      writeStoredFlag(dropdownStorageKey, next);
    },
    [dropdownStorageKey]
  );
  const onCardsModeChange = config.onCardsModeChange;
  const persistCards = useCallback(
    (next: boolean) => {
      setCardsMode(next);
      writeStoredFlag(cardsStorageKey, next);
      onCardsModeChange?.(next);
    },
    [cardsStorageKey, onCardsModeChange]
  );

  const toggleGroup = useCallback(
    (key: string) =>
      setCollapsed((previous) => {
        const next = new Set(previous);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    []
  );
  const handleSelect = useCallback(
    (key: string) => {
      if (key.startsWith(GROUP_PREFIX)) {
        toggleGroup(key);
        return;
      }
      config.onSelect(key);
    },
    [config, toggleGroup]
  );
  const handleToggleBranch = useCallback(
    (key: string) => key.startsWith(GROUP_PREFIX) && toggleGroup(key),
    [toggleGroup]
  );
  const handleToggleFavorite = useCallback(
    (key: string) => {
      if (!config.enableFavorites || !itemByKey.has(key)) return;
      setFavoriteKeys((previous) => {
        const next = new Set(previous);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        writeStoredStringSet(favoritesStorageKey, next);
        return next;
      });
    },
    [config.enableFavorites, favoritesStorageKey, itemByKey]
  );
  const handleModeChange = useCallback(
    (next: string) => {
      if (next === "cards") {
        persistDropdown(false);
        persistCards(true);
        return;
      }
      persistCards(false);
      if (next === "dropdown") {
        persistDropdown(true);
        return;
      }
      persistDropdown(false);
      if (next === "left-menu") nav.switchToLeftMenu();
      else nav.switchToNavigator();
    },
    [nav, persistCards, persistDropdown]
  );
  const handleExpandAll = useCallback(() => setCollapsed(new Set()), []);
  const handleCollapseAll = useCallback(() => setCollapsed(new Set(allGroups)), [allGroups]);
  const openNavigator = useCallback(() => nav.openNavigator(), [nav]);

  const viewMode: RecordNavigator["viewMode"] = cardsMode
    ? "cards"
    : dropdownMode
      ? "dropdown"
      : nav.isLeftMenuMode
        ? "left-menu"
        : "navigator";

  const gear = (
    <NavigatorSettingsGear
      mode={viewMode}
      onModeChange={handleModeChange}
      title={t("navSettings")}
      modeLabel={t("navMode")}
      navigatorLabel={t("navModeNavigator")}
      showNavigatorOption={config.showNavigatorSetting !== false}
      leftMenuLabel={t(config.leftMenuModeLabel ?? "navModeLeftMenu")}
      dropdownLabel={t("navModeDropdown")}
      cardsLabel={config.enableCardsMode ? t("navModeCards") : undefined}
      modeOrder={config.settingsModeOrder}
      testIdPrefix={config.testIdPrefix}
    />
  );

  // Mode shortcut buttons (outside the gear): Navigator / Left menu (+ Cards
  // when enabled) one click away in the tree icon bar and the cards toolbar.
  const modeShortcut = (mode: RecordNavigator["viewMode"], icon: ReactNode, label: string) => (
    <button
      type="button"
      className={`inv-iv3-cattree-tool-btn aops-v2-mode-shortcut${viewMode === mode ? " is-active" : ""}`}
      aria-label={label}
      title={label}
      aria-pressed={viewMode === mode}
      onClick={() => handleModeChange(mode)}
      data-testid={`${config.testIdPrefix}-shortcut-${mode}`}
    >
      {icon}
    </button>
  );
  const modeShortcuts = config.showModeShortcuts === false ? null : (
    <>
      {modeShortcut("navigator", NavigatorModeIcon, t("navModeNavigator"))}
      {modeShortcut("left-menu", LeftMenuModeShortcutIcon, t("navModeLeftMenu"))}
      {config.enableCardsMode ? modeShortcut("cards", CardsModeIcon, t("navModeCards")) : null}
    </>
  );
  const treeClose = config.showTreeClose ? (
    <button
      type="button"
      className="inv-iv3-cattree-tool-btn aops-v2-tree-close"
      aria-label={t(config.treeCloseLabel ?? "navSidePanelClose")}
      title={t(config.treeCloseLabel ?? "navSidePanelClose")}
      onClick={() => nav.setOpen(false)}
      data-testid={`${config.testIdPrefix}-tree-close`}
    >
      {CloseTreePanelIcon}
    </button>
  ) : null;
  const treeSettingsSlot = config.showTreeSettings === false && !modeShortcuts && !treeClose ? null : (
    <>
      {config.showTreeSettings === false ? null : gear}
      {modeShortcuts}
      {treeClose}
    </>
  );

  const treePanel = (
    <div
      className={`aops-v2-tree-wrap${config.treeClassName ? ` ${config.treeClassName}` : ""}`}
      style={{ display: "contents" }}
    >
      <NavigatorTreePanel
        rows={rows}
        hasCategories={totalItemCount > 0}
        totalItemCount={totalItemCount}
        selectedCategoryKey={config.selectedKey ?? ""}
        countsByCategoryUid={counts}
        searchValue={search}
        onSearchChange={setSearch}
        searchTrailingSlot={config.searchTrailingSlot}
        onSelectCategory={handleSelect}
        onToggleBranch={handleToggleBranch}
        onToggleFavorite={config.enableFavorites ? handleToggleFavorite : undefined}
        favoriteCategoryUids={config.enableFavorites ? favoriteKeys : undefined}
        favoriteEntries={config.enableFavorites ? favoriteEntries : undefined}
        showRowFavorite={Boolean(config.enableFavorites)}
        showAllCategoriesRow={false}
        iconBar={
          <NavigatorCategoryIconBar
            settingsSlot={treeSettingsSlot}
            onExpandAll={handleExpandAll}
            onCollapseAll={handleCollapseAll}
            expandDisabled={collapsed.size === 0}
            collapseDisabled={allGroups.size === 0 || collapsed.size >= allGroups.size}
          />
        }
        unclassifiedLabel={t(config.labels.unclassified)}
        searchPlaceholder={t(config.labels.searchPlaceholder)}
        searchAriaLabel={t(config.labels.searchAria)}
        controlsAriaLabel={t(config.labels.toolsAria)}
        paneAriaLabel={t(config.labels.paneAria)}
        emptyLabel={t(config.labels.empty)}
        emptySearchLabel={t(config.labels.emptySearch)}
        tItems={(_key: string, fallback = "") => fallback}
      />
    </div>
  );

  const dockNode = (
    <WorkbenchNavigator
      controller={nav}
      label="NAVIGATOR"
      panelTitle={t(config.labels.panelTitle)}
      showHeader
      showProjectSelection={false}
      dockClassName={config.dockClassName}
      headerActions={
        <>
          <NavigatorLeftMenuButton active={false} onClick={() => handleModeChange("left-menu")} />
          {config.enableCardsMode ? (
            <button
              type="button"
              className="mini-button ghost icon-only inv-iv3-leftmenu-header-btn"
              aria-label={t("navModeCards")}
              title={t("navModeCards")}
              onClick={() => handleModeChange("cards")}
              data-testid={`${config.testIdPrefix}-header-cards`}
            >
              {CardsModeIcon}
            </button>
          ) : null}
          <span className="aops-v2-navhead-sep" aria-hidden />
        </>
      }
    >
      {treePanel}
    </WorkbenchNavigator>
  );

  const launcherNode =
    !cardsMode && !dropdownMode && !nav.isLeftMenuMode && !nav.pinned ? (
      dockNode
    ) : !cardsMode && !dropdownMode && !nav.isLeftMenuMode && !nav.open ? (
      <button
        type="button"
        className="aops-v2-nav-reopen"
        onClick={openNavigator}
        aria-label={t("navPaneReopen")}
        title={t("navPaneReopen")}
        data-testid={`${config.testIdPrefix}-nav-reopen`}
      >
        <ProjectScopeNavigatorLabel label={t("navModeNavigator")} />
      </button>
    ) : null;

  const dropdownNode = (
    <RecordDropdown
      config={config}
      gear={config.showDropdownSettings === false ? null : gear}
      t={t}
    />
  );

  const leftDockMode: RecordNavigator["leftDockMode"] =
    cardsMode || dropdownMode || nav.isLeftMenuMode
      ? "hidden"
      : nav.pinned
        ? (nav.open ? "pinned" : "hidden")
        : "overlay";

  return {
    viewMode,
    controller: nav,
    treePanel,
    dockNode,
    dropdownNode,
    launcherNode,
    gearNode: gear,
    isLeftMenuMode: nav.isLeftMenuMode,
    isDropdownMode: dropdownMode,
    isCardsMode: cardsMode,
    selectRecord: config.onSelect,
    switchMode: handleModeChange,
    openNavigator,
    leftDockMode,
    leftDockWidth: nav.navigatorWidth
  };
}

// Dropdown mode: a compact searchable record selector at the content top-left,
// plus the mode gear so the operator can switch back to left-menu / navigator.
function RecordDropdown<T>({
  config,
  gear,
  t
}: {
  config: RecordNavigatorConfig<T>;
  gear: ReactNode;
  t: NavT;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    const raf = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.cancelAnimationFrame(raf);
    };
  }, [open]);

  const flat = useMemo(() => config.groups.flatMap((group) => group.items), [config.groups]);
  const selected = flat.find((item) => config.itemKey(item) === config.selectedKey) ?? null;
  const q = query.trim().toLowerCase();
  const filtered = q ? flat.filter((item) => config.searchText(item).toLowerCase().includes(q)) : flat;

  return (
    <div className="aops-pm-boardnav-dropdown" ref={rootRef}>
      <button
        type="button"
        className="aops-pm-boardnav-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid={`${config.testIdPrefix}-dropdown-trigger`}
      >
        <span className="aops-pm-boardnav-trigger-icon">{config.dropdownIcon}</span>
        <span className="aops-pm-boardnav-trigger-k">{t(config.labels.dropdownKicker)}</span>
        <b className="aops-pm-boardnav-trigger-name">
          {selected ? config.itemLabel(selected) : t(config.labels.dropdownSelect)}
        </b>
        <span className="aops-pm-boardnav-caret" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open ? (
        <div className="aops-pm-boardnav-menu" role="listbox">
          <input
            ref={inputRef}
            className="aops-pm-boardnav-search"
            type="text"
            value={query}
            placeholder={t(config.labels.searchPlaceholder)}
            aria-label={t(config.labels.searchAria)}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="aops-pm-boardnav-list">
            {filtered.length === 0 ? (
              <div className="aops-pm-boardnav-empty">{t(config.labels.emptySearch)}</div>
            ) : (
              filtered.map((item) => {
                const key = config.itemKey(item);
                const active = key === config.selectedKey;
                const meta = config.itemMeta?.(item);
                return (
                  <button
                    key={key}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`aops-pm-boardnav-item${active ? " is-active" : ""}`}
                    onClick={() => {
                      config.onSelect(key);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span className="aops-pm-boardnav-item-name">{config.itemLabel(item)}</span>
                    {config.showDropdownMeta !== false && meta && meta.length ? (
                      <span className="aops-pm-boardnav-item-slug">{meta[0]}</span>
                    ) : null}
                    {active ? <span className="aops-pm-boardnav-item-check">✓</span> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
      {gear ? <div className="aops-pm-boardnav-gear">{gear}</div> : null}
    </div>
  );
}
