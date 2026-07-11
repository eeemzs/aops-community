import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsFetching } from "@tanstack/react-query";
import {
  DESKTOP_SHELL_ICONS,
  DesktopStatusBar,
  WorkbenchPageHeader,
  type SidebarItem
} from "@aopslab/xf-ui-shell-react";
import { AuthGate } from "./components/AuthGate";
import { AuthBar } from "./components/AuthBar";
import { CockpitShell } from "./components/CockpitShell";
import { ThemeStudio } from "./components/ThemeStudio";
import { DebugPanel } from "./components/DebugPanel";
import {
  AOPS_COCKPIT_DEFAULT_PAGE_ID,
  cockpitPluginRegistry,
  renderCockpitPage,
  type AopsCockpitPluginContext
} from "./plugins/aopsCockpitPlugin";
import { createAopsApiClient } from "./lib/aopsApi";
import { authSessionKey, useAuthSessionQuery, type AuthMeResult, type AuthPrincipal } from "./lib/auth";
import { useChatSession } from "./lib/chat";
import { useChatNavigator } from "./lib/chatNavigator";
import { useCockpitTranslator, type AopsCockpitTranslationKey } from "./lib/i18n";
import { useProjectmanData } from "./lib/projectman";
import { useProjectsQuery, type ProjectOption } from "./lib/projects";
import { useProjectsNavigator } from "./lib/projectsNavigator";
import {
  allCockpitNavItems,
  isAgentspacePage,
  isProjectmanPage,
  projectmanSectionForPage,
  type CockpitNavDef
} from "./lib/sections";
import { useAgentspaceData } from "./lib/agentspace";
import { useDocmanData } from "./lib/docman";
import { useDocsNavigator } from "./lib/docsNavigator";
import { ProjectmanBand, PROJECTMAN_SECTION_TITLES } from "./pages/projectman/ProjectmanBand";
import { ChatSpacesBand } from "./pages/chat/ChatSpacesBand";
import { useBoardsNavigator } from "./lib/boardsNavigator";
import { useSprintsNavigator } from "./lib/sprintsNavigator";
import {
  byRecordUpdatedDesc,
  planItemFromImplementationPlan,
  planItemFromSprint
} from "./pages/projectman/helpers";
import { resolveAopsCockpitRuntimeConfig } from "./lib/runtimeConfig";
import { useShellStore } from "./state/shellStore";
import { useShellAppearance } from "./state/themeStyle";
import { useApiActivityStore } from "./state/apiActivityStore";
import type { ProjectmanRefTarget } from "./lib/projectmanRefs";
import { useCockpitViewport } from "./lib/viewport";

// Inert non-null sentinel for AppShell.leftDock in overlay mode (see the
// leftDock prop comment) — never actually mounted (the shell only renders the
// dock slot when pinned), but the shell derives the dock host data-mode from
// whether leftDock is non-null, and overlay needs data-mode="overlay" so the
// portaled popover is visible. The real launcher lives in the thin bar.
const OVERLAY_DOCK_ANCHOR = <span aria-hidden hidden />;
const CHATV3_SPACE_ADMIN_PERMISSIONS = new Set([
  "*",
  "chatv3.*",
  "chatv3.channel.manage",
  "chatv3.space.manage"
]);

const ChatThinbarBackIcon = (
  <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
    <path d="M10 2.5 4.5 8 10 13.5M4.5 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChatThinbarRefreshIcon = (
  <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
    <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.88M13.5 2.5v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function hasChatv3SpaceAdminPermission(permissions: readonly string[] | undefined): boolean {
  return Boolean(permissions?.some((permission) => CHATV3_SPACE_ADMIN_PERMISSIONS.has(permission)));
}

function validatedTrustedPrincipal(me: AuthMeResult | undefined): AuthPrincipal | null {
  if (me?.authProvider !== "trusted-local" || me.authRequired !== false || !me.principal) return null;
  const userId = me.principal.userId?.trim();
  if (!userId) return null;
  return { ...me.principal, userId };
}

function ChatThinbarActions({
  isFetching,
  onRefresh,
  onBack,
  t
}: {
  isFetching: boolean;
  onRefresh: () => void;
  onBack: () => void;
  t: (key: AopsCockpitTranslationKey) => string;
}): ReactNode {
  return (
    <div className="aops-pm-actionbar aops-chat-thinbar-actions">
      <button
        type="button"
        className={`aops-pm-action-btn${isFetching ? " is-busy" : ""}`}
        onClick={onRefresh}
        aria-label={t("pmRefresh")}
        title={t("pmRefresh")}
      >
        {ChatThinbarRefreshIcon}
      </button>
      <button
        type="button"
        className="aops-pm-action-btn"
        onClick={onBack}
        aria-label={t("pmActionBack")}
        title={t("pmActionBack")}
      >
        {ChatThinbarBackIcon}
      </button>
    </div>
  );
}

export function App() {
  const viewport = useCockpitViewport();
  const runtimeConfig = useMemo(() => resolveAopsCockpitRuntimeConfig(), []);
  const locale = useShellStore((state) => state.locale);
  const setLocale = useShellStore((state) => state.setLocale);
  const toggleLocale = useShellStore((state) => state.toggleLocale);
  const t = useCockpitTranslator(locale);
  const client = useMemo(
    () => createAopsApiClient({ baseUrl: runtimeConfig.serverBaseUrl }),
    [runtimeConfig.serverBaseUrl]
  );
  const authQuery = useAuthSessionQuery(client);
  const sessionKey = authSessionKey(authQuery.data);
  const trustedPrincipal = validatedTrustedPrincipal(authQuery.data);
  const trustedReady = Boolean(trustedPrincipal);

  const activePageId = useShellStore((state) => state.activePageId);
  const setActivePageId = useShellStore((state) => state.setActivePageId);
  const navMode = useShellStore((state) => state.navMode);
  const setNavMode = useShellStore((state) => state.setNavMode);
  const toggleTheme = useShellStore((state) => state.toggleTheme);
  const setThemeId = useShellStore((state) => state.setThemeId);
  const setAccentId = useShellStore((state) => state.setAccentId);
  const appearance = useShellAppearance();
  const selectedProjectKey = useShellStore((state) => state.selectedProjectKey);
  const setSelectedProjectKey = useShellStore((state) => state.setSelectedProjectKey);
  const customThemes = useShellStore((state) => state.customThemes);
  const addCustomTheme = useShellStore((state) => state.addCustomTheme);
  const updateCustomTheme = useShellStore((state) => state.updateCustomTheme);
  const deleteCustomTheme = useShellStore((state) => state.deleteCustomTheme);
  const [themeStudioOpen, setThemeStudioOpen] = useState(false);
  const wasAgentspaceActiveRef = useRef(false);
  // Two-level nav: which parent branches the operator has collapsed (all expanded
  // by default so PM ▸ Boards/Sprints/… is visible).
  const [collapsedBranches, setCollapsedBranches] = useState<Set<string>>(() => new Set());
  const apiLogs = useApiActivityStore((state) => state.logs);
  const debugOpen = useApiActivityStore((state) => state.debugOpen);
  const toggleDebug = useApiActivityStore((state) => state.toggleDebug);
  const clearApiLogs = useApiActivityStore((state) => state.clearLogs);
  // Footer activity dots pulse while any query is in flight (shared eops look).
  const fetchingCount = useIsFetching();

  const projectsQuery = useProjectsQuery({
    client,
    sessionKey,
    enabled: trustedReady
  });

  const resolvedPageId = cockpitPluginRegistry.resolvePage(
    activePageId,
    AOPS_COCKPIT_DEFAULT_PAGE_ID
  );
  const isProjectsPage = resolvedPageId === "projects";
  const isAgentspaceActive = isAgentspacePage(resolvedPageId);
  const isChatPage = resolvedPageId === "chat";
  const projects = projectsQuery.data ?? [];
  const selectedProject =
    projects.find((project) => project.key === selectedProjectKey) ?? projects[0] ?? null;
  const projectStatus =
    projectsQuery.isPending && trustedReady ? "loading" : projectsQuery.isError ? "error" : projects.length ? "ready" : "empty";
  // Projects navigator built at App level so it can render shell-attached (the
  // far-left workbench dock, navigator mode) or inline in ProjectsPage (left-menu).
  const projectsNavigator = useProjectsNavigator(
    {
      projects,
      selectedProjectKey,
      onSelectProject: setSelectedProjectKey,
      allowLeftMenuMode: !isAgentspaceActive
    },
    t
  );
  const projectmanClient = useMemo(
    () =>
      createAopsApiClient({
        baseUrl: runtimeConfig.serverBaseUrl,
        projectId: selectedProject?.projectId,
        scopeId: selectedProject?.scopeId
      }),
    [runtimeConfig.serverBaseUrl, selectedProject?.projectId, selectedProject?.scopeId]
  );
  // Boards cards-mode flag mirrored at App level (recordNavigator reports
  // changes) so the project-wide kanban-tasks list can stay DEFERRED while the
  // cards register loads tasks per board on demand.
  const isBoardsSection =
    isProjectmanPage(resolvedPageId) && projectmanSectionForPage(resolvedPageId) === "boards";
  const [boardsCardsMode, setBoardsCardsMode] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem("aops-cockpit-v2.boards.cardsMode") === "1";
    } catch {
      return false;
    }
  });
  const [pendingProjectmanRef, setPendingProjectmanRef] = useState<ProjectmanRefTarget | null>(null);
  const pendingTaskLookup = pendingProjectmanRef?.kind === "task" && !pendingProjectmanRef.boardId;
  const projectman = useProjectmanData({
    client: projectmanClient,
    sessionKey,
    selectedProject,
    enabled: trustedReady && projectsQuery.isSuccess,
    // Tasks are a PM-section read: don't prefetch them from other pages, and
    // keep them deferred in boards cards mode (per-board lazy loads instead).
    tasksEnabled: (isProjectmanPage(resolvedPageId) || pendingTaskLookup) && !(isBoardsSection && boardsCardsMode)
  });

  // Board selection is owned at App level so the boards navigator can render
  // shell-attached (navigator dock) or inline (left-menu / dropdown). Auto-pick
  // the first board when the project's board set changes.
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  useEffect(() => {
    const boards = projectman.boards;
    if (!boards.length) {
      if (selectedBoardId !== null) setSelectedBoardId(null);
      return;
    }
    if (!selectedBoardId || !boards.some((board) => board.id === selectedBoardId)) {
      setSelectedBoardId(boards[0].id);
    }
  }, [projectman.boards, selectedBoardId]);
  const boardsNavigator = useBoardsNavigator(
    {
      boards: projectman.boards,
      selectedBoardId,
      onSelectBoard: setSelectedBoardId,
      onCardsModeChange: setBoardsCardsMode
    },
    t
  );
  // Sprints navigator: merge sprints + implementation plans into one selectable
  // item list (App-owned selection, like boards), so the navigator can render
  // shell-attached / inline / dropdown.
  const sprintItems = useMemo(
    () =>
      [
        ...projectman.sprints.map((sprint) => planItemFromSprint(sprint)),
        ...projectman.implementationPlans.map((plan) => planItemFromImplementationPlan(plan))
      ].sort(byRecordUpdatedDesc),
    [projectman.sprints, projectman.implementationPlans]
  );
  const [selectedSprintKey, setSelectedSprintKey] = useState<string | null>(null);
  useEffect(() => {
    if (!sprintItems.length) {
      if (selectedSprintKey !== null) setSelectedSprintKey(null);
      return;
    }
    if (!selectedSprintKey || !sprintItems.some((item) => item.key === selectedSprintKey)) {
      setSelectedSprintKey(sprintItems[0].key);
    }
  }, [sprintItems, selectedSprintKey]);
  const sprintsNavigator = useSprintsNavigator(
    {
      items: sprintItems,
      selectedKey: selectedSprintKey,
      onSelect: setSelectedSprintKey
    },
    t
  );
  const pmSection = isProjectmanPage(resolvedPageId)
    ? projectmanSectionForPage(resolvedPageId)
    : null;
  const isBoardsPage = pmSection === "boards";
  const isSprintsPage = pmSection === "sprints";
  // The active PM section navigator (boards or sprints) for shell-dock wiring.
  const pmNav = isBoardsPage ? boardsNavigator : isSprintsPage ? sprintsNavigator : null;
  const mobilePmDock =
    viewport.viewport === "mobile" &&
    pmNav !== null &&
    !pmNav.isCardsMode &&
    !pmNav.isDropdownMode;

  // Hosted ChatV3 keeps its channel-member credential protocol while
  // space administration is bound to the validated trusted principal.
  const chatPrincipal = trustedPrincipal;
  const chatAdminEnabled =
    authQuery.isSuccess &&
    Boolean(chatPrincipal) &&
    hasChatv3SpaceAdminPermission(chatPrincipal?.permissions);
  const chat = useChatSession(runtimeConfig.serverBaseUrl, {
    adminEnabled: chatAdminEnabled,
    principalUserId: chatPrincipal?.userId ?? null,
    tenantId: authQuery.data?.tenantId ?? "default"
  });  const chatNavigator = useChatNavigator(chat, t);

  // Hosted Agentspace reads share the projectman-scoped client (same
  // project/scope headers); queries gate on the Agentspace pages being active.
  const agentspace = useAgentspaceData({
    client: projectmanClient,
    sessionKey,
    selectedProject,
    enabled: trustedReady && projectsQuery.isSuccess && (isProjectsPage || isAgentspaceActive)
  });

  // Hosted Docman reads (Docs A1 page) — same gating pattern.
  const isDocsPage = resolvedPageId === "docs";
  const docman = useDocmanData({
    client: projectmanClient,
    sessionKey,
    selectedProject,
    enabled: trustedReady && projectsQuery.isSuccess && (isProjectsPage || isDocsPage)
  });
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  useEffect(() => {
    const documents = docman.documents;
    if (!documents.length) {
      if (selectedDocumentId !== null) setSelectedDocumentId(null);
      return;
    }
    if (!selectedDocumentId || !documents.some((document) => document.id === selectedDocumentId)) {
      setSelectedDocumentId(documents[0].id);
    }
  }, [docman.documents, selectedDocumentId]);
  const docsNavigator = useDocsNavigator(
    {
      docman,
      selectedDocumentId,
      onSelectDocument: setSelectedDocumentId
    },
    t
  );

  useEffect(() => {
    document.documentElement.dataset.theme = appearance.snapshot.theme;
    document.documentElement.dataset.accent = appearance.snapshot.accent;
    document.documentElement.dataset.density = "comfortable";
    document.documentElement.lang = locale;
  }, [appearance.snapshot.theme, appearance.snapshot.accent, locale]);

  useEffect(() => {
    const enteringAgentspace = isAgentspaceActive && !wasAgentspaceActiveRef.current;
    wasAgentspaceActiveRef.current = isAgentspaceActive;
    if (!enteringAgentspace) return;
    if (projectsNavigator.isLeftMenuMode) {
      projectsNavigator.controller.switchToNavigator();
    }
    if (!projectsNavigator.isNavigatorOpen) {
      projectsNavigator.openNavigator();
    }
  }, [
    isAgentspaceActive,
    projectsNavigator.controller,
    projectsNavigator.isLeftMenuMode,
    projectsNavigator.isNavigatorOpen,
    projectsNavigator.openNavigator
  ]);


  useEffect(() => {
    if (!projectsQuery.isSuccess) return;
    if (!projects.length) {
      if (selectedProjectKey !== null) setSelectedProjectKey(null);
      return;
    }
    if (!selectedProjectKey || !projects.some((project) => project.key === selectedProjectKey)) {
      setSelectedProjectKey(projects[0].key);
    }
  }, [
    projects,
    projectsQuery.isSuccess,
    selectedProjectKey,
    setSelectedProjectKey
  ]);

  // Single unified left menu (eops-desktop mechanic): every section's nav items
  // flattened into one sidebar list — no top-level section switch. A nav item id
  // IS the active page id.
  const navItems = useMemo<SidebarItem[]>(() => {
    const toItem = (def: CockpitNavDef): SidebarItem => ({
      id: def.id,
      label: def.labelKey ? t(def.labelKey) : def.label ?? def.id,
      icon: def.icon,
      children: def.children?.map(toItem),
      expanded: def.children ? !collapsedBranches.has(def.id) : undefined
    });
    return allCockpitNavItems().map(toItem);
  }, [t, collapsedBranches]);

  // Mission → implementation-plan bridge: select the sprint (plan id = sprint
  // id) and route to PM ▸ Sprints. Falls back to the auto-select when the id
  // is not in the current project's list.
  const openPlanInSprints = useCallback(
    (planId: string) => {
      const item = sprintItems.find((entry) => entry.id === planId);
      setSelectedSprintKey(item?.key ?? null);
      setActivePageId("pm-sprints");
    },
    [sprintItems, setActivePageId]
  );
  const openProjectmanRef = useCallback(
    (target: ProjectmanRefTarget) => {
      setPendingProjectmanRef(target);
      if (target.kind === "sprint") {
        openPlanInSprints(target.id);
        return;
      }
      if (target.kind === "board") {
        setSelectedBoardId(target.id);
        setActivePageId("pm-boards");
        return;
      }
      setBoardsCardsMode(false);
      if (target.boardId) setSelectedBoardId(target.boardId);
      setActivePageId("pm-boards");
    },
    [openPlanInSprints, setActivePageId]
  );

  useEffect(() => {
    if (!pendingProjectmanRef) return;
    if (pendingProjectmanRef.kind === "board") {
      setSelectedBoardId(pendingProjectmanRef.id);
      setPendingProjectmanRef(null);
      return;
    }
    if (pendingProjectmanRef.kind === "sprint") {
      const item = sprintItems.find((entry) => entry.id === pendingProjectmanRef.id);
      if (item) {
        setSelectedSprintKey(item.key);
        setPendingProjectmanRef(null);
      }
      return;
    }
    if (pendingProjectmanRef.boardId) {
      setSelectedBoardId(pendingProjectmanRef.boardId);
      setPendingProjectmanRef(null);
      return;
    }
    const task = projectman.tasks.find(
      (row) => row.id === pendingProjectmanRef.id || row.taskCode === pendingProjectmanRef.id
    );
    if (task?.boardId) {
      setSelectedBoardId(task.boardId);
      setPendingProjectmanRef(null);
    }
  }, [pendingProjectmanRef, projectman.tasks, sprintItems]);

  const handleToggleBranch = useCallback((item: SidebarItem) => {
    setCollapsedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }, []);

  const context = useMemo<AopsCockpitPluginContext>(
    () => ({
      activePageId: resolvedPageId,
      t,
      locale,
      projects: {
        status: projectStatus,
        projects,
        selectedProject,
        selectedProjectKey,
        error: projectsQuery.error,
        isFetching: projectsQuery.isFetching,
        onRefresh: () => {
          void projectsQuery.refetch();
        },
        onSelectProject: setSelectedProjectKey
      },
      projectsNavigator,
      projectman,
      boardsNavigator,
      selectedBoardId,
      sprintsNavigator,
      selectedSprintKey,
      chat,
      chatNavigator,
      agentspace,
      docman,
      docsNavigator,
      selectedDocumentId,
      onNavigate: setActivePageId,
      onOpenPlan: openPlanInSprints,
      onOpenProjectmanRef: openProjectmanRef
    }),
    [
      agentspace,
      docman,
      docsNavigator,
      selectedDocumentId,
      sessionKey,
      openProjectmanRef,
      openPlanInSprints,
      boardsNavigator,
      sprintsNavigator,
      selectedSprintKey,
      chat,
      chatNavigator,
      locale,
      projectStatus,
      projectman,
      projects,
      projectsNavigator,
      projectsQuery,
      resolvedPageId,
      selectedBoardId,
      selectedProject,
      selectedProjectKey,
      setActivePageId,
      setSelectedProjectKey,
      t
    ]
  );
  const renderedPage = renderCockpitPage(resolvedPageId, context) as ReactNode;
  const pageHeader = pageHeaderFor(resolvedPageId, t, selectedProject);

  if (authQuery.isPending || authQuery.isError || !trustedPrincipal) {
    return (
      <AuthGate
        error={authQuery.error ?? (!trustedPrincipal ? new Error("trusted_local_principal_required") : null)}
        mode={authQuery.isPending ? "loading" : "error"}
        serverBaseUrl={runtimeConfig.serverBaseUrl}
        locale={locale}
        t={t}
        onRetry={() => void authQuery.refetch()}
        onToggleLocale={toggleLocale}
      />
    );
  }  const principalLabel =
    trustedPrincipal.fullName || trustedPrincipal.email || trustedPrincipal.userId;  const statusBar = (
    <DesktopStatusBar
      icons={DESKTOP_SHELL_ICONS}
      windowActions={[
        { id: "minimize", label: "Minimize" },
        { id: "maximize", label: "Maximize" },
        { id: "close", label: "Close" }
      ]}
      windowPulseActive={fetchingCount > 0}
      statusMessages={[
        { id: "api", label: t("statusApi"), text: runtimeConfig.serverBaseUrl },
        {
          id: "project",
          label: t("statusProject"),
          text: selectedProject ? selectedProject.slug ?? selectedProject.key : t("statusNoProject")
        }
      ]}
      backendState="online"
      backendStatusLabel={principalLabel}
      debugOpen={debugOpen}
      onToggleDebug={toggleDebug}
      debugStats={{ total: apiLogs.length }}
    />
  );
  const usesProjectNavigatorDock = isProjectsPage || isAgentspaceActive;
  const mobileDocsDock =
    viewport.viewport === "mobile" &&
    isDocsPage &&
    !docsNavigator.isCardsMode &&
    !docsNavigator.isDropdownMode;
  const mobileProjectsDock = viewport.viewport === "mobile" && usesProjectNavigatorDock;

  return (
    <>
    <CockpitShell
      viewport={viewport.viewport}
      compactDensity={viewport.compactDensity}
      navItems={navItems}
      activePage={resolvedPageId}
      onNavigate={(item) => setActivePageId(item.id)}
      onToggleBranch={handleToggleBranch}
      navMode={navMode}
      onSetNavMode={setNavMode}
      navLabels={{
        collapse: t("navCollapse"),
        expand: t("navExpand"),
        hide: t("navHide"),
        hideHint: t("navHideHint"),
        headerControls: t("navHeaderControls")
      }}
      navReopenLabel={t("navReopen")}
      leftDock={
        mobilePmDock
          ? pmNav.dockNode
          : mobileDocsDock
            ? docsNavigator.dockNode
            : mobileProjectsDock
              ? projectsNavigator.dockNode
          : pmNav && pmNav.leftDockMode === "pinned"
          ? pmNav.dockNode
          : pmNav && pmNav.leftDockMode === "overlay"
            ? OVERLAY_DOCK_ANCHOR
            : isDocsPage && docsNavigator.leftDockMode === "pinned"
              ? docsNavigator.dockNode
            : isDocsPage && docsNavigator.leftDockMode === "overlay"
                ? OVERLAY_DOCK_ANCHOR
                  : usesProjectNavigatorDock && projectsNavigator.leftDockMode === "pinned"
                    ? projectsNavigator.dockNode
                    : usesProjectNavigatorDock && projectsNavigator.leftDockMode === "overlay"
                      ? OVERLAY_DOCK_ANCHOR
                      : null
      }
      leftDockMode={
        mobilePmDock
          ? "pinned"
          : mobileDocsDock || mobileProjectsDock
            ? "pinned"
          : pmNav
          ? pmNav.leftDockMode
          : isDocsPage
            ? docsNavigator.leftDockMode
              : usesProjectNavigatorDock
                ? projectsNavigator.leftDockMode
                : "hidden"
      }
      leftDockWidth={
        pmNav
          ? pmNav.leftDockWidth
          : isDocsPage
            ? docsNavigator.leftDockWidth
            : isChatPage
              ? chatNavigator.leftDockWidth
              : projectsNavigator.leftDockWidth
      }
      thinBar={
        isProjectmanPage(resolvedPageId) ? (
          <div className="aops-pm-thinbar-row">
            {pmNav ? pmNav.launcherNode : null}
            <ProjectmanBand
              projects={context.projects}
              crumb={t(PROJECTMAN_SECTION_TITLES[projectmanSectionForPage(resolvedPageId)])}
              isFetching={projectman.isFetching}
              onRefresh={projectman.refresh}
              onBack={() => setActivePageId("projects")}
              t={t}
            />
          </div>
        ) : isAgentspaceActive ? (
          <div className="aops-pm-thinbar-row aops-as-project-scope-row">
            {projectsNavigator.recentsBar}
            <ProjectmanBand
              projects={context.projects}
              projectOptions={projectsNavigator.scopeProjectOptions}
              favoriteProjectKeys={projectsNavigator.scopeFavoriteProjectKeys}
              projectMenuTitle={t("projectsNavFavoritesRecentTitle")}
              crumb=""
              isFetching={agentspace.isFetching}
              onRefresh={agentspace.refresh}
              onBack={() => setActivePageId("projects")}
              t={t}
            />
          </div>
        ) : isDocsPage ? (
          <div className="aops-pm-thinbar-row">
            {docsNavigator.launcherNode}
            <ProjectmanBand
              projects={context.projects}
              crumb={t("docsTitle")}
              isFetching={docman.isFetching}
              onRefresh={docman.refresh}
              onBack={() => setActivePageId("projects")}
              t={t}
            />
          </div>
        ) : isProjectsPage && projectStatus === "ready" ? (
          projectsNavigator.recentsBar
        ) : isChatPage ? (
          <div className="aops-pm-thinbar-row">
            <ChatSpacesBand
              spaces={chat.spaces}
              activeSpaceSlug={chat.activeSpaceSlug}
              onSelectSpace={(slug) => void chat.selectSpace(slug)}
              onCreateSpace={chat.createSpace}
              onArchiveSpace={chat.archiveSpace}
              adminEnabled={chatAdminEnabled}
              adminStatus={chat.spaceAdminStatus}
              adminError={chat.spaceAdminError}
              t={t}
            />
            <ChatThinbarActions
              isFetching={chat.status === "connecting"}
              onRefresh={() => void chat.refreshAdminSpaces()}
              onBack={() => setActivePageId("projects")}
              t={t}
            />
          </div>
        ) : null
      }
      appearanceStyle={appearance.style as CSSProperties}
      theme={appearance.snapshot.theme}
      accent={appearance.snapshot.accent}
      activeThemeId={appearance.snapshot.themeId}
      themeOptions={appearance.themeOptions}
      accentOptions={appearance.accentOptions}
      onSetThemeId={setThemeId}
      onSetAccent={setAccentId}
      onToggleTheme={toggleTheme}
      onOpenThemeStudio={() => setThemeStudioOpen(true)}
      locale={locale}
      onSetLocale={setLocale}
      authBar={<AuthBar principal={trustedPrincipal} t={t} />}
      statusBar={statusBar}
      t={t}
    >
      {!isProjectsPage && !isChatPage ? (
        <WorkbenchPageHeader
          eyebrow={pageHeader.eyebrow}
          title={pageHeader.title}
          note={pageHeader.note}
        />
      ) : null}
      {renderedPage}
    </CockpitShell>
    <ThemeStudio
      open={themeStudioOpen}
      onClose={() => setThemeStudioOpen(false)}
      themeCatalog={appearance.themeCatalog}
      activeThemeId={appearance.snapshot.themeId}
      activeAccent={appearance.snapshot.accent}
      accentOptions={appearance.accentOptions}
      theme={appearance.snapshot.theme}
      customThemes={customThemes}
      onSetThemeId={setThemeId}
      onSetAccent={setAccentId}
      onToggleTheme={toggleTheme}
      onAddCustomTheme={addCustomTheme}
      onUpdateCustomTheme={updateCustomTheme}
      onDeleteCustomTheme={deleteCustomTheme}
      t={t}
    />
      <DebugPanel open={debugOpen} logs={apiLogs} onClose={toggleDebug} onClear={clearApiLogs} t={t} />
    </>
  );
}

function pageHeaderFor(
  pageId: string,
  t: ReturnType<typeof useCockpitTranslator>,
  selectedProject?: ProjectOption | null
) {
  if (isProjectmanPage(pageId)) {
    // Compact PM header: no eyebrow; "PM Workbench / <slug>" + a Project Id
    // line (with the project name when it differs from the slug).
    const slug = selectedProject?.slug || selectedProject?.name || "";
    const name = selectedProject?.name && selectedProject.name !== slug ? selectedProject.name : "";
    const note = selectedProject?.projectId
      ? `${t("pmHeaderProjectId")}: ${selectedProject.projectId}${name ? ` · ${name}` : ""}`
      : t("pmHeaderNote");
    return {
      eyebrow: "",
      title: slug ? `${t("pmTitle")} / ${slug}` : t("pmTitle"),
      note
    };
  }

  if (isAgentspacePage(pageId)) {
    return {
      eyebrow: "",
      title: t("asTitle"),
      note: t("asHeaderNote")
    };
  }

  if (pageId === "docs") {
    return {
      eyebrow: t("docsEyebrow"),
      title: t("docsTitle"),
      note: t("docsHeaderNote")
    };
  }

  if (pageId === "chat") {
    return {
      eyebrow: t("chatEyebrow"),
      title: t("chatTitle"),
      note: t("chatHeaderNote")
    };
  }

  return {
    eyebrow: t("projectsEyebrow"),
    title: t("projectsTitle"),
    note: t("projectsHeaderNote")
  };
}
