import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  NavigatorCategoryIconBar,
  NavigatorLeftMenuButton,
  NavigatorTreePanel,
  ProjectScopeNavigatorLabel,
  ProjectScopeRecentProjectsBar,
  useWorkbenchNavigator,
  WorkbenchNavigator,
  WorkbenchThinBar,
  type NavigatorTreeRow,
  type WorkbenchNavigatorController
} from "@aopslab/xf-ui-composition-react";
import { CockpitPanelCloseIcon } from "../components/CockpitViewIconSwitch";
import type { ProjectOption } from "./projects";
import type { AopsCockpitTranslationKey } from "./i18n";

type NavT = (key: AopsCockpitTranslationKey) => string;

// The projects navigator is built at App level (not inside ProjectsPage) so the
// SAME tree can render either shell-attached (the far-left workbench dock, in
// "navigator" mode) or inline in the page (master-detail, "left-menu" mode). The
// hook owns search/expansion/favorite state + the workbench controller, and
// emits three ready-to-place nodes: `dockNode` (shell leftDock, navigator mode),
// `treePanel` (the bare tree for the in-page left-menu split), and `recentsBar`
// (the top rail of recently-opened / favorited projects, eops parity).

const ALL_PROJECTS_KEY = "__all_projects__";
const STATUS_PREFIX = "status:";

const NAV_STORAGE_KEYS = {
  mode: "aops-cockpit-v2.projects.navMode",
  open: "aops-cockpit-v2.projects.navOpen",
  pinned: "aops-cockpit-v2.projects.navPinned",
  navigatorWidth: "aops-cockpit-v2.projects.navWidth",
  leftMenuWidth: "aops-cockpit-v2.projects.leftMenuWidth"
};

// Shared with the recents bar so favorites toggled on a tree row pin the same
// project first in the top rail. The recents bar reads this key + live-listens
// to the composition lib's favorite-sync CustomEvent; we write the same shape
// and dispatch the same event so both surfaces stay in sync within the tab.
const FAVORITE_STORAGE_KEY = "aops-cockpit-v2.projects.favorites";
const RECENT_STORAGE_KEY = "aops-cockpit-v2.projects.recents";
// Mirrors the internal event name in xf-ui-composition-react's
// project-scope-selector (FAVORITE_PROJECTS_SYNC_EVENT) — the integration
// contract for cross-surface favorite sync in the same document.
const FAVORITE_SYNC_EVENT = "xf-project-scope:favorite-projects-change";
const RECENT_SYNC_EVENT = "xf-project-scope:recent-projects-change";
const MAX_RECENT_PROJECTS = 8;

function statusLabel(status: string, t: NavT): string {
  if (status === "unknown") return t("projectsNavUnknownStatus");
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function readFavoriteIds(): string[] {
  return readStoredProjectIds(FAVORITE_STORAGE_KEY);
}

function readRecentIds(): string[] {
  return readStoredProjectIds(RECENT_STORAGE_KEY, MAX_RECENT_PROJECTS);
}

function readStoredProjectIds(storageKey: string, maxItems: number | null = null): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    const ids = Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string" && id) : [];
    return maxItems == null ? ids : ids.slice(0, Math.max(1, maxItems));
  } catch {
    return [];
  }
}

function writeFavoriteIds(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FAVORITE_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // localStorage failures must not block the workspace.
  }
  try {
    window.dispatchEvent(
      new CustomEvent(FAVORITE_SYNC_EVENT, {
        detail: { storageKey: FAVORITE_STORAGE_KEY, projectIds: ids }
      })
    );
  } catch {
    // ignore event dispatch failures
  }
}

type ProjectNavRow = NavigatorTreeRow;

// Build the visible navigator rows from the flat project list: one branch per
// status with its projects as leaves, plus per-branch counts. Search filters
// leaves by name/slug and force-expands matching branches.
function buildProjectRows(
  projects: ProjectOption[],
  collapsed: Set<string>,
  search: string,
  t: NavT
): { rows: ProjectNavRow[]; counts: Record<string, { total: number }> } {
  const query = search.trim().toLowerCase();
  const groups = new Map<string, ProjectOption[]>();
  for (const project of projects) {
    const status = project.status ?? "unknown";
    const list = groups.get(status) ?? [];
    list.push(project);
    groups.set(status, list);
  }

  const rows: ProjectNavRow[] = [];
  const counts: Record<string, { total: number }> = {};
  for (const [status, list] of groups) {
    const groupKey = `${STATUS_PREFIX}${status}`;
    const matched = query
      ? list.filter((project) =>
          `${project.name} ${project.slug}`.toLowerCase().includes(query)
        )
      : list;
    if (query && matched.length === 0) continue;
    counts[groupKey] = { total: list.length };
    const isExpanded = query ? true : !collapsed.has(status);
    rows.push({
      categoryUid: groupKey,
      depth: 0,
      hasChildren: true,
      isExpanded,
      label: statusLabel(status, t),
      hideDefaultMeta: true
    });
    if (!isExpanded) continue;
    for (const project of matched) {
      rows.push({
        categoryUid: project.key,
        depth: 1,
        hasChildren: false,
        label: project.name,
        hideDefaultMeta: true,
        metaLines:
          project.slug && project.slug !== project.name ? [project.slug] : undefined
      });
    }
  }
  return { rows, counts };
}

export interface ProjectsNavigatorModel {
  projects: ProjectOption[];
  selectedProjectKey: string | null;
  onSelectProject: (projectKey: string | null) => void;
  allowLeftMenuMode?: boolean;
}

export interface ProjectsNavigator {
  /** Shared workbench controller. The Projects page feeds this into
   *  WorkbenchRecordDetailLayout so geometry remains host-owned. */
  controller: WorkbenchNavigatorController;
  /** The bare navigator tree (search + icon bar + tree). Rendered inline in
   *  ProjectsPage's master-detail split when in left-menu mode. */
  treePanel: ReactNode;
  /** The shell-attached navigator dock (NAVIGATOR header + pin/close + the
   *  tree). Handed to AppShell's leftDock in navigator mode. */
  dockNode: ReactNode;
  /** Top rail of recently-opened + favorited projects (eops parity). */
  recentsBar: ReactNode;
  /** Same favorite-first/history list used by the top rail, for scoped dropdowns. */
  scopeProjectOptions: ProjectOption[];
  /** Project keys that are pinned as favorites in the shared project scope rail. */
  scopeFavoriteProjectKeys: string[];
  /** Re-open / overlay launcher for the shell-attached Project Navigator. */
  launcherNode: ReactNode;
  isLeftMenuMode: boolean;
  /** Whether the shell-attached navigator dock is open (navigator mode). */
  isNavigatorOpen: boolean;
  /** Whether the navigator dock is pinned (vs. unpinned overlay popover). */
  isPinned: boolean;
  /** Re-open the shell-attached navigator dock after a close. */
  openNavigator: () => void;
  /** AppShell left-dock mode for the shell-attached navigator. */
  leftDockMode: "hidden" | "overlay" | "pinned";
  leftDockWidth: number;
}

export function useProjectsNavigator(model: ProjectsNavigatorModel, t: NavT): ProjectsNavigator {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => readFavoriteIds());
  const [recentIds, setRecentIds] = useState<string[]>(() => readRecentIds());
  const nav = useWorkbenchNavigator({
    storageKeys: NAV_STORAGE_KEYS,
    defaultMode: "left-menu",
    defaultOpen: true,
    // Uncontrolled pin state (default pinned) so the dock's pin/unpin button
    // toggles: pinned -> shell dock; unpinned -> overlay popover (launcher in the
    // recents thin bar, panel portals to the shell dock host).
    defaultPinned: true,
    // eops navigator dock default width (CATEGORY_NAVIGATOR_DEFAULT_WIDTH);
    // the in-content left-menu pane matches the Partner Details A1 body rhythm.
    defaultNavigatorWidth: 360,
    defaultLeftMenuWidth: 350,
    leftMenuMinWidth: 340,
    leftMenuMaxWidth: 520
  });

  const { rows, counts } = useMemo(
    () => buildProjectRows(model.projects, collapsed, search, t),
    [model.projects, collapsed, search, t]
  );
  const selectedKey = model.selectedProjectKey ?? ALL_PROJECTS_KEY;
  const allStatuses = useMemo(
    () => Array.from(new Set(model.projects.map((project) => project.status ?? "unknown"))),
    [model.projects]
  );
  const projectByKey = useMemo(
    () => new Map(model.projects.map((project) => [project.key, project] as const)),
    [model.projects]
  );

  // Keep favorites in sync if another surface (the recents bar) rewrites them.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleSync = (event: Event) => {
      const detail =
        event instanceof CustomEvent && event.detail && typeof event.detail === "object"
          ? (event.detail as { storageKey?: string; projectIds?: string[] })
          : {};
      if (detail.storageKey !== FAVORITE_STORAGE_KEY) return;
      const next = Array.isArray(detail.projectIds)
        ? detail.projectIds.filter((id) => typeof id === "string" && id)
        : readFavoriteIds();
      setFavoriteIds((previous) =>
        previous.length === next.length && previous.every((id, index) => id === next[index])
          ? previous
          : next
      );
    };
    window.addEventListener(FAVORITE_SYNC_EVENT, handleSync as EventListener);
    return () => window.removeEventListener(FAVORITE_SYNC_EVENT, handleSync as EventListener);
  }, []);

  // Keep recents in sync with the top rail, which owns history ordering and
  // writes the selected project into the shared storage key.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleSync = (event: Event) => {
      const detail =
        event instanceof CustomEvent && event.detail && typeof event.detail === "object"
          ? (event.detail as { storageKey?: string; projectIds?: string[] })
          : {};
      if (detail.storageKey !== RECENT_STORAGE_KEY) return;
      const next = Array.isArray(detail.projectIds)
        ? detail.projectIds.filter((id) => typeof id === "string" && id).slice(0, MAX_RECENT_PROJECTS)
        : readRecentIds();
      setRecentIds((previous) =>
        previous.length === next.length && previous.every((id, index) => id === next[index])
          ? previous
          : next
      );
    };
    window.addEventListener(RECENT_SYNC_EVENT, handleSync as EventListener);
    return () => window.removeEventListener(RECENT_SYNC_EVENT, handleSync as EventListener);
  }, []);

  useEffect(() => {
    const selectedProjectKey = model.selectedProjectKey;
    if (!selectedProjectKey) return;
    setRecentIds((previous) => {
      if (previous.includes(selectedProjectKey)) return previous;
      return [...previous, selectedProjectKey].slice(-MAX_RECENT_PROJECTS);
    });
  }, [model.selectedProjectKey]);

  const favoriteCategoryUids = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  // Chips above the tree — favorited projects only (status branches are not
  // meaningful favorites, so they never resolve to a chip).
  const favoriteEntries = useMemo(
    () =>
      favoriteIds
        .map((id) => {
          const project = projectByKey.get(id);
          if (!project) return null;
          return { categoryUid: id, label: project.name, pathText: project.slug ?? project.name };
        })
        .filter((entry): entry is { categoryUid: string; label: string; pathText: string } =>
          Boolean(entry)
        ),
    [favoriteIds, projectByKey]
  );
  const scopeProjectOptions = useMemo(() => {
    const favoriteProjects = favoriteIds
      .map((id) => projectByKey.get(id))
      .filter((project): project is ProjectOption => Boolean(project));
    const favoriteSet = new Set(favoriteProjects.map((project) => project.key));
    const recentProjects = recentIds
      .map((id) => projectByKey.get(id))
      .filter((project): project is ProjectOption => project != null && !favoriteSet.has(project.key));
    return [...favoriteProjects, ...recentProjects];
  }, [favoriteIds, projectByKey, recentIds]);
  // Recents bar data: every project as a flat selectable item.
  const recentProjectItems = useMemo(
    () =>
      model.projects.map((project) => ({
        id: project.key,
        name: project.name,
        slug: project.slug ?? project.key
      })),
    [model.projects]
  );

  const toggleStatus = useCallback(
    (status: string) =>
      setCollapsed((previous) => {
        const next = new Set(previous);
        if (next.has(status)) next.delete(status);
        else next.add(status);
        return next;
      }),
    []
  );

  const handleSelect = useCallback(
    (key: string) => {
      if (key === ALL_PROJECTS_KEY) {
        model.onSelectProject(null);
        return;
      }
      if (key.startsWith(STATUS_PREFIX)) {
        toggleStatus(key.slice(STATUS_PREFIX.length));
        return;
      }
      model.onSelectProject(key);
    },
    [model, toggleStatus]
  );
  const handleToggleBranch = useCallback(
    (key: string) => {
      if (key.startsWith(STATUS_PREFIX)) toggleStatus(key.slice(STATUS_PREFIX.length));
    },
    [toggleStatus]
  );
  const handleExpandAll = useCallback(() => setCollapsed(new Set()), []);
  const handleCollapseAll = useCallback(
    () => setCollapsed(new Set(allStatuses)),
    [allStatuses]
  );
  // Favorites are project leaves only; ignore status branches + the All row.
  const handleToggleFavorite = useCallback(
    (uid: string) => {
      if (!uid || uid === ALL_PROJECTS_KEY || uid.startsWith(STATUS_PREFIX)) return;
      setFavoriteIds((previous) => {
        const next = previous.includes(uid)
          ? previous.filter((id) => id !== uid)
          : [...previous, uid];
        writeFavoriteIds(next);
        return next;
      });
    },
    []
  );
  const openNavigator = useCallback(() => nav.openNavigator(), [nav]);
  const handleSelectRecent = useCallback(
    (key: string) => {
      if (key && key !== ALL_PROJECTS_KEY) model.onSelectProject(key);
    },
    [model]
  );

  // `display: contents` keeps the wrapper layout-neutral (always-stacked
  // toolrow; the gear's old Layout switch is retired).
  const treePanel = (
    <div className="aops-v2-tree-wrap" style={{ display: "contents" }}>
    <NavigatorTreePanel
      rows={rows}
      hasCategories={model.projects.length > 0}
      totalItemCount={model.projects.length}
      allRowKey={ALL_PROJECTS_KEY}
      selectedCategoryKey={selectedKey}
      countsByCategoryUid={counts}
      searchValue={search}
      onSearchChange={setSearch}
      onSelectCategory={handleSelect}
      onToggleBranch={handleToggleBranch}
      onToggleFavorite={handleToggleFavorite}
      favoriteCategoryUids={favoriteCategoryUids}
      favoriteEntries={favoriteEntries}
      showRowFavorite
      iconBar={
        <NavigatorCategoryIconBar
          settingsSlot={
            <button
              type="button"
              className="inv-iv3-cattree-tool-btn aops-v2-tree-close"
              aria-label={t("navSidePanelClose")}
              title={t("navSidePanelClose")}
              onClick={() => nav.setOpen(false)}
              data-testid="aops-v2-projects-tree-close"
            >
              <CockpitPanelCloseIcon />
            </button>
          }
          onExpandAll={handleExpandAll}
          onCollapseAll={handleCollapseAll}
          expandDisabled={collapsed.size === 0}
          collapseDisabled={allStatuses.length === 0 || collapsed.size >= allStatuses.length}
        />
      }
      showAllCategoriesRow
      unclassifiedLabel={t("projectsNavUntitled")}
      searchPlaceholder={t("projectsNavSearch")}
      searchAriaLabel={t("projectsNavFilter")}
      controlsAriaLabel={t("projectsNavTools")}
      paneAriaLabel={t("projectsNavPane")}
      emptyLabel={t("projectsNavEmpty")}
      emptySearchLabel={t("projectsNavEmptySearch")}
      tItems={(_key: string, fallback = "") =>
        fallback === "All categories" ? t("projectsNavAll") : fallback
      }
    />
    </div>
  );

  // Shell-attached navigator dock: WorkbenchNavigator renders the
  // ProjectScopeSelectorDock (NAVIGATOR / Projects header + pin/close + a
  // full-height body holding the tree). The header's left-menu button mirrors
  // eops's quick switch out of the dock.
  const dockNode = (
    <WorkbenchNavigator
      controller={nav}
      label={t("projectsNavPanelTitle")}
      panelTitle={t("projectsNavPanelTitle")}
      showHeader
      showProjectSelection={false}
      dockClassName="aops-v2-projects-navdock"
      headerActions={
        model.allowLeftMenuMode === false ? null : (
          <NavigatorLeftMenuButton active={false} onClick={() => nav.switchToLeftMenu()} />
        )
      }
    >
      {treePanel}
    </WorkbenchNavigator>
  );

  const launcherNode =
    !nav.isLeftMenuMode && !nav.pinned ? (
      // Unpinned (overlay): the navigator itself renders as a launcher +
      // popover, hosted here in the thin bar (eops parity — never the body).
      dockNode
    ) : !nav.isLeftMenuMode && !nav.open ? (
      // Pinned but closed (X): a simple re-open affordance.
      <button
        type="button"
        className="aops-v2-nav-reopen"
        onClick={openNavigator}
        aria-label={t("navPaneReopen")}
        title={t("navPaneReopen")}
        data-testid="aops-v2-nav-reopen"
      >
        <ProjectScopeNavigatorLabel label={t("projectsNavPanelTitle")} />
      </button>
    ) : null;

  // Top rail of recently-opened + favorited projects (eops parity). The recents
  // bar auto-tracks the active project into its recents store and pins shared
  // favorites first.
  const recentsBar = (
    <WorkbenchThinBar
      className="aops-v2-projects-toprail inv-iv3-detail-toprail"
      launcherClassName="inventory-itemsv2-topbar-launcher"
      mainClassName="inventory-itemsv2-topbar-recents"
      launcher={launcherNode}
      main={
        <ProjectScopeRecentProjectsBar
          projectItems={recentProjectItems}
          activeProjectId={model.selectedProjectKey ?? ""}
          onSelectProjectId={handleSelectRecent}
          recentProjectStorageKey={RECENT_STORAGE_KEY}
          favoriteProjectStorageKey={FAVORITE_STORAGE_KEY}
          maxRecentProjects={MAX_RECENT_PROJECTS}
          visibleCount={4}
          ariaLabel={t("projectsNavRecents")}
          emptyLabel={t("projectsNavRecentsEmpty")}
          removeLabel={t("projectsNavRecentsRemove")}
        />
      }
    />
  );

  const leftDockMode: "hidden" | "overlay" | "pinned" = nav.isLeftMenuMode
    ? "hidden"
    : nav.pinned
      ? nav.open
        ? "pinned"
        : "hidden"
      : "overlay";

  return {
    controller: nav,
    treePanel,
    dockNode,
    recentsBar,
    scopeProjectOptions,
    scopeFavoriteProjectKeys: favoriteIds,
    launcherNode,
    isLeftMenuMode: nav.isLeftMenuMode,
    isNavigatorOpen: nav.open,
    isPinned: nav.pinned,
    openNavigator,
    leftDockMode,
    leftDockWidth: nav.navigatorWidth
  };
}
