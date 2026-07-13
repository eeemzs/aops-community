import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  WorkbenchSectionShell,
  WorkbenchStatePanel,
  WorkbenchSubviewShell
} from "@aopslab/xf-ui-shell-react";
import {
  WorkbenchDetailTabs,
  WorkbenchRecordDetailLayout
} from "@aopslab/xf-ui-composition-react";
import { apiErrorMessage } from "../lib/aopsApi";
import type { AgentspaceDataModel } from "../lib/agentspace";
import type { DocmanDataModel } from "../lib/docman";
import type { AopsCockpitLocale, AopsCockpitTranslationKey } from "../lib/i18n";
import { isArchivedPmRecord, isOpenStatus, shortId, type ProjectmanDataModel } from "../lib/projectman";
import type { ProjectsNavigator } from "../lib/projectsNavigator";
import type { ProjectOption } from "../lib/projects";
import { formatPmDate } from "./projectman/helpers";

export interface ProjectsPageModel {
  status: "loading" | "error" | "empty" | "ready";
  projects: ProjectOption[];
  selectedProject: ProjectOption | null;
  selectedProjectKey: string | null;
  error: unknown;
  isFetching: boolean;
  onRefresh: () => void;
  onSelectProject: (projectKey: string | null) => void;
}

interface ProjectsPageProps {
  model: ProjectsPageModel;
  // Built at App level so the same tree can render shell-attached (navigator
  // mode, via the shell leftDock) or inline here (left-menu mode).
  navigator: ProjectsNavigator;
  projectman: ProjectmanDataModel;
  agentspace: AgentspaceDataModel;
  docman: DocmanDataModel;
  onNavigate?: (pageId: string) => void;
  onOpenPlan?: (planId: string) => void;
  locale: AopsCockpitLocale;
  t: (key: AopsCockpitTranslationKey) => string;
}

type ProjectDetailTabId = "overview" | "activity" | "planning" | "memory" | "docs";

type ProjectActivityDomain = "planning" | "memory" | "docs";
type ProjectActivityRange = "day" | "week" | "month" | "all";

interface ProjectActivityEvent {
  id: string;
  domain: ProjectActivityDomain;
  kind: string;
  title: string;
  meta?: string | null;
  status?: string | null;
  timestamp: string;
  epoch: number;
  pageId: string;
}

interface ProjectDomainPulse {
  id: ProjectActivityDomain;
  tabId: Exclude<ProjectDetailTabId, "overview" | "activity">;
  label: string;
  count: number;
  status: "select-project" | "loading" | "error" | "empty" | "ready";
  latestAt: string | null;
}

interface ProjectDetailTabDef {
  id: ProjectDetailTabId;
  labelKey: AopsCockpitTranslationKey;
  hintKey: AopsCockpitTranslationKey;
}

interface ProjectDetailTabItem {
  id: ProjectDetailTabId;
  label: string;
  title: string;
  count?: number;
  panelId: string;
  [key: string]: unknown;
}

const PROJECT_DETAIL_TABS: ProjectDetailTabDef[] = [
  {
    id: "overview",
    labelKey: "projectTabOverview",
    hintKey: "projectTabOverviewHint"
  },
  {
    id: "activity",
    labelKey: "projectTabActivity",
    hintKey: "projectTabActivityHint"
  },
  {
    id: "planning",
    labelKey: "projectTabPlanning",
    hintKey: "projectTabPlanningHint"
  },
  {
    id: "memory",
    labelKey: "projectTabMemory",
    hintKey: "projectTabMemoryHint"
  },
  {
    id: "docs",
    labelKey: "projectTabDocs",
    hintKey: "projectTabDocsHint"
  },

];

export function ProjectsPage({
  model,
  navigator,
  projectman,
  agentspace,
  docman,
  onNavigate,
  onOpenPlan,
  locale,
  t
}: ProjectsPageProps) {
  const isFetching =
    model.isFetching ||
    projectman.isFetching ||
    agentspace.isFetching ||
    docman.isFetching;
  const refreshAll = () => {
    model.onRefresh();
    projectman.refresh();
    agentspace.refresh();
    docman.refresh();
  };
  let body: ReactNode = null;
  if (model.status === "loading") {
    body = (
      <WorkbenchStatePanel
        variant="loading"
        title={t("projectsLoadingTitle")}
        message={t("projectsLoadingMessage")}
      />
    );
  } else if (model.status === "error") {
    body = (
      <WorkbenchStatePanel
        variant="error"
        title={t("projectsErrorTitle")}
        message={apiErrorMessage(model.error, "projects_unavailable")}
        actions={
          <button type="button" className="aops-v2-secondary-button" onClick={model.onRefresh}>
            {t("authRetry")}
          </button>
        }
      />
    );
  } else if (model.status === "empty") {
    body = (
      <WorkbenchStatePanel
        variant="empty"
        title={t("projectsEmptyTitle")}
        message={t("projectsEmptyMessage")}
      />
    );
  } else if (model.status === "ready") {
    body = (
      <ProjectsRecordSurface
        model={model}
        navigator={navigator}
        projectman={projectman}
        agentspace={agentspace}
        docman={docman}
        onNavigate={onNavigate}
        onOpenPlan={onOpenPlan}
        locale={locale}
        t={t}
      />
    );
  }

  return (
    <WorkbenchSectionShell
      className="aops-v2-section"
      mainClassName="aops-v2-section-main"
      toolbar={
        <div className="aops-project-toolbar">
          <span>
            {t("projectCount")}: <b>{model.projects.length}</b>
          </span>
          <button
            type="button"
            className="aops-v2-secondary-button"
            disabled={isFetching}
            onClick={refreshAll}
          >
            {t("projectsRefresh")}
          </button>
        </div>
      }
    >
      <WorkbenchSubviewShell
        className="aops-v2-projects-subview"
        title={t("projectsListLabel")}
      >
        {body}
      </WorkbenchSubviewShell>
    </WorkbenchSectionShell>
  );
}

function ProjectsRecordSurface({
  model,
  navigator,
  projectman,
  agentspace,
  docman,
  onNavigate,
  onOpenPlan,
  locale,
  t
}: {
  model: ProjectsPageModel;
  navigator: ProjectsNavigator;
  projectman: ProjectmanDataModel;
  agentspace: AgentspaceDataModel;
  docman: DocmanDataModel;
  onNavigate?: (pageId: string) => void;
  onOpenPlan?: (planId: string) => void;
  locale: AopsCockpitLocale;
  t: (key: AopsCockpitTranslationKey) => string;
}) {
  const [activeTab, setActiveTab] = useState<ProjectDetailTabId>("overview");
  const selectedProject = model.selectedProject;
  const activityEvents = useMemo(
    () => buildProjectActivityEvents({ projectman, agentspace, docman, t }),
    [agentspace, docman, projectman, t]
  );
  const tabCounts = useMemo(
    () => ({
      planning:
        projectman.boards.length +
        projectman.tasks.length +
        projectman.sprints.length +
        projectman.implementationPlans.length +
        projectman.issues.length +
        projectman.feedback.length +
        projectman.reviewRequests.length,
      memory:
        agentspace.memoryItems.length +
        agentspace.missions.length +
        agentspace.discussions.length +
        agentspace.prompts.length +
        agentspace.skills.length +
        agentspace.artifacts.length +
        agentspace.resources.length +
        agentspace.agentProfiles.length,
      docs: docman.documents.length + docman.groups.length,
      activity: activityEvents.length
    }),
    [
      activityEvents.length,
      agentspace.agentProfiles.length,
      agentspace.artifacts.length,
      agentspace.discussions.length,
      agentspace.memoryItems.length,
      agentspace.missions.length,
      agentspace.prompts.length,
      agentspace.resources.length,
      agentspace.skills.length,
      docman.documents.length,
      docman.groups.length,
      projectman.boards.length,
      projectman.feedback.length,
      projectman.implementationPlans.length,
      projectman.issues.length,
      projectman.reviewRequests.length,
      projectman.sprints.length,
      projectman.tasks.length
    ]
  );
  const domainPulses = useMemo<ProjectDomainPulse[]>(
    () => [
      {
        id: "planning",
        tabId: "planning",
        label: t("projectDomainProjectman"),
        count: tabCounts.planning,
        status: projectman.status,
        latestAt: activityEvents.find((event) => event.domain === "planning")?.timestamp ?? null
      },
      {
        id: "memory",
        tabId: "memory",
        label: t("projectDomainAgentspace"),
        count: tabCounts.memory,
        status: agentspace.status,
        latestAt: activityEvents.find((event) => event.domain === "memory")?.timestamp ?? null
      },
      {
        id: "docs",
        tabId: "docs",
        label: t("projectDomainDocman"),
        count: tabCounts.docs,
        status: docman.status,
        latestAt: activityEvents.find((event) => event.domain === "docs")?.timestamp ?? null
      }
    ],
    [activityEvents, agentspace.status, docman.status, projectman.status, tabCounts, t]
  );
  const tabs = useMemo<ProjectDetailTabItem[]>(
    () =>
      PROJECT_DETAIL_TABS.map((tab) => ({
        id: tab.id,
        label: t(tab.labelKey),
        title: t(tab.hintKey),
        count: tab.id === "overview" || tab.id === "activity" ? undefined : tabCounts[tab.id],
        panelId: `aops-project-tabpanel-${tab.id}`
      })),
    [t, tabCounts]
  );
  useEffect(() => {
    setActiveTab("overview");
  }, [selectedProject?.key]);

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab("overview");
    }
  }, [activeTab, tabs]);

  const detail = selectedProject ? (
    <ProjectDetailPanel
      project={selectedProject}
      activeTab={activeTab}
      projectman={projectman}
      agentspace={agentspace}
      docman={docman}
      activityEvents={activityEvents}
      domainPulses={domainPulses}
      onSelectTab={setActiveTab}
      onNavigate={onNavigate}
      onOpenPlan={onOpenPlan}
      locale={locale}
      t={t}
    />
  ) : (
    <div className="aops-v2-route-proof" aria-label={t("projectsRegistryBadge")}>
      <span>{t("projectsRegistryBadge")}</span>
    </div>
  );
  const tabsNode = selectedProject ? (
    <WorkbenchDetailTabs
      className="aops-project-detail-tabs"
      tabClassName="aops-project-detail-tab"
      badgeClassName="aops-project-detail-tab-badge"
      items={tabs}
      activeId={activeTab}
      onChange={(tabId) => setActiveTab(tabId as ProjectDetailTabId)}
      ariaLabel={t("projectDetailTabsLabel")}
    />
  ) : null;

  return (
    <div
      className={[
        "aops-project-record-surface",
        navigator.isLeftMenuMode ? "is-left-menu" : "is-detail-only"
      ].join(" ")}
      data-testid="aops-projects-record-surface"
    >
      <ProjectIdentityHero
        project={model.selectedProject}
        tabCounts={tabCounts}
        t={t}
      />
      <WorkbenchRecordDetailLayout
        controller={navigator.controller}
        navigator={navigator.treePanel}
        navigatorLabel={t("projectsNavPanelTitle")}
        navigatorPanelTitle={t("projectsNavPanelTitle")}
        className="aops-project-record-layout"
        leftMenuClassName="inv-iv3-detail-leftmenu-shell aops-project-record-leftmenu"
        leftMenuPanelClassName="inv-iv3-detail-leftmenu-panel aops-project-record-leftmenu-panel"
        leftMenuToggle={
          <button
            type="button"
            className="aops-project-record-nav-mode"
            aria-label={t("navModeNavigator")}
            title={t("navModeNavigator")}
            onClick={navigator.controller.switchToNavigator}
          >
            <PanelMenuIcon size={13} />
          </button>
        }
        closedMenuToggle={
          <button
            type="button"
            className="aops-project-record-nav-mode"
            aria-label={t("navPaneReopen")}
            title={t("navPaneReopen")}
            onClick={navigator.controller.openNavigator}
          >
            <PanelMenuIcon size={13} />
          </button>
        }
        tabs={tabsNode}
        tabsPlacement="above-content"
        contentClassName="aops-project-record-content"
        content={detail}
        data-testid="aops-projects-record-layout"
      />
    </div>
  );
}

function ProjectIdentityHero({
  project,
  tabCounts,
  t
}: {
  project: ProjectOption | null;
  tabCounts: {
    planning: number;
    memory: number;
    docs: number;
  };
  t: (key: AopsCockpitTranslationKey) => string;
}) {
  const projectName = project?.name ?? t("projectsTitle");
  const projectSlug = project?.slug ?? t("unknownValue");
  const noteParts = [
    project?.status,
    project?.visibility,
    project?.projectType
  ].filter((part): part is string => Boolean(part));

  return (
    <header className="aops-project-record-hero">
      <span className="aops-project-record-eyebrow">{t("projectsEyebrow")}</span>
      <div className="aops-project-record-title-row">
        <h3>{projectName}</h3>
        {project ? (
          <span className="aops-project-record-title-supplement">
            <span aria-hidden="true">/</span>
            <span title={projectSlug}>{projectSlug}</span>
          </span>
        ) : null}
      </div>
      <p className="aops-project-record-note">
        {noteParts.length ? noteParts.join(" · ") : t("projectsHeaderNote")}
      </p>
      <dl className="aops-project-record-metrics" aria-label={t("projectReferences")}>
        <ProjectHeroMetric
          label={t("projectScope")}
          value={compactId(project?.scopeId)}
          fullValue={project?.scopeId}
          t={t}
        />
        <ProjectHeroMetric label={t("projectTabPlanning")} value={String(tabCounts.planning)} t={t} />
        <ProjectHeroMetric label={t("projectTabMemory")} value={String(tabCounts.memory)} t={t} />
        <ProjectHeroMetric label={t("projectTabDocs")} value={String(tabCounts.docs)} t={t} />
      </dl>
    </header>
  );
}

function ProjectHeroMetric({
  label,
  value,
  fullValue,
  t
}: {
  label: string;
  value: string | null;
  fullValue?: string | null;
  t: (key: AopsCockpitTranslationKey) => string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd title={fullValue?.trim() || value?.trim() || undefined}>
        {value?.trim() ? value : t("unknownValue")}
      </dd>
    </div>
  );
}

function PanelMenuIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.4" y="4.4" width="17.2" height="15.2" rx="2.6" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.6 4.8v14.4" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function compactId(id: string | null | undefined): string | null {
  const text = id?.trim();
  return text ? shortId(text) : null;
}

function ProjectDetailPanel({
  project,
  activeTab,
  projectman,
  agentspace,
  docman,
  activityEvents,
  domainPulses,
  onSelectTab,
  onNavigate,
  onOpenPlan,
  locale,
  t
}: {
  project: ProjectOption;
  activeTab: ProjectDetailTabId;
  projectman: ProjectmanDataModel;
  agentspace: AgentspaceDataModel;
  docman: DocmanDataModel;
  activityEvents: ProjectActivityEvent[];
  domainPulses: ProjectDomainPulse[];
  onSelectTab: (tabId: ProjectDetailTabId) => void;
  onNavigate?: (pageId: string) => void;
  onOpenPlan?: (planId: string) => void;
  locale: AopsCockpitLocale;
  t: (key: AopsCockpitTranslationKey) => string;
}) {
  return (
    <aside
      className="aops-project-detail"
      aria-label={t("projectDetailTitle")}
      data-testid="aops-project-detail"
    >
      <div
        className="aops-project-detail-body"
        role="tabpanel"
        id={`aops-project-tabpanel-${activeTab}`}
        data-testid="aops-project-detail-panel"
      >
        {activeTab === "overview" ? (
          <ProjectOverview
            project={project}
            domainPulses={domainPulses}
            activityEvents={activityEvents}
            projectman={projectman}
            agentspace={agentspace}
            onSelectTab={onSelectTab}
            locale={locale}
            t={t}
          />
        ) : null}
        {activeTab === "activity" ? (
          <ProjectActivityDashboard
            events={activityEvents}
            onNavigate={onNavigate}
            locale={locale}
            t={t}
          />
        ) : null}
        {activeTab === "planning" ? (
          <ProjectPlanningSummary
            model={projectman}
            onNavigate={onNavigate}
            onOpenPlan={onOpenPlan}
            t={t}
          />
        ) : null}
        {activeTab === "memory" ? (
          <ProjectAgentspaceSummary model={agentspace} onNavigate={onNavigate} t={t} />
        ) : null}
        {activeTab === "docs" ? (
          <ProjectDocsSummary model={docman} onNavigate={onNavigate} t={t} />
        ) : null}
      </div>
    </aside>
  );
}

type ProjectSummaryMetric = {
  label: string;
  value: string | number;
};

type ProjectSummaryItem = {
  title: string;
  meta?: string | null;
  status?: string | null;
};

function ProjectPlanningSummary({
  model,
  onNavigate,
  onOpenPlan,
  t
}: {
  model: ProjectmanDataModel;
  onNavigate?: (pageId: string) => void;
  onOpenPlan?: (planId: string) => void;
  t: (key: AopsCockpitTranslationKey) => string;
}) {
  const activeBoards = model.boards.filter((board) => !isArchivedPmRecord(board));
  const activeSprints = model.sprints.filter((sprint) => !isArchivedPmRecord(sprint));
  const activePlans = model.implementationPlans.filter((plan) => !isArchivedPmRecord(plan));
  const latestPlan = [...activePlans, ...activeSprints].sort(byUpdatedDesc)[0] ?? null;
  const openItems =
    model.issues.filter((issue) => isOpenStatus(issue.status)).length +
    model.feedback.filter((feedback) => isOpenStatus(feedback.status)).length;
  const requestedReviews = model.reviewRequests.filter((review) => isOpenStatus(review.status)).length;
  const latestItems: ProjectSummaryItem[] = latestPlan
    ? [
        {
          title: latestPlan.name ?? latestPlan.id,
          meta: `${latestPlan.id ? shortId(latestPlan.id) : t("unknownValue")} / ${activePlans.some((plan) => plan.id === latestPlan.id) ? t("pmPlans") : t("pmSprints")}`,
          status: (latestPlan as { status?: string | null }).status
        }
      ]
    : [];

  return (
    <ProjectSummaryPanel
      title={t("projectPlanningTitle")}
      message={t("projectPlanningMessage")}
      status={model.status}
      metrics={[
        { label: t("pmBoards"), value: activeBoards.length },
        { label: t("pmTasks"), value: model.tasks.length },
        { label: t("pmSprints"), value: activeSprints.length },
        { label: t("pmPlans"), value: activePlans.length },
        { label: t("pmOpenItems"), value: openItems },
        { label: t("pmRequestedReviews"), value: requestedReviews }
      ]}
      latestTitle={t("projectLatestPlan")}
      latestItems={latestItems}
      emptyMessage={t("projectSummaryEmpty")}
      actions={
        <>
          <button
            type="button"
            className="aops-v2-secondary-button"
            onClick={() => onNavigate?.("pm-boards")}
            disabled={!onNavigate}
          >
            {t("projectOpenPlanning")}
          </button>
          <button
            type="button"
            className="aops-v2-secondary-button"
            onClick={() => latestPlan && onOpenPlan?.(latestPlan.id)}
            disabled={!latestPlan || !onOpenPlan}
          >
            {t("projectOpenPlan")}
          </button>
        </>
      }
      t={t}
    />
  );
}

function ProjectAgentspaceSummary({
  model,
  onNavigate,
  t
}: {
  model: AgentspaceDataModel;
  onNavigate?: (pageId: string) => void;
  t: (key: AopsCockpitTranslationKey) => string;
}) {
  const latestMemory = model.memoryItems[0] ?? null;
  const latestItems: ProjectSummaryItem[] = latestMemory
    ? [
        {
          title: oneLine(latestMemory.content, latestMemory.kind ?? latestMemory.id),
          meta: latestMemory.kind ?? latestMemory.durability ?? shortId(latestMemory.id),
          status: latestMemory.durability
        }
      ]
    : [];

  return (
    <ProjectSummaryPanel
      title={t("projectMemoryTitle")}
      message={t("projectMemoryMessage")}
      status={model.status}
      metrics={[
        { label: t("asSectionMemory"), value: model.memoryItems.length },
        { label: t("asSectionMissions"), value: model.missions.length },
        { label: t("asSectionDiscussions"), value: model.discussions.length },
        { label: t("asSectionPrompts"), value: model.prompts.length },
        { label: t("asSectionSkills"), value: model.skills.length },
        { label: t("asSectionResources"), value: model.resources.length }
      ]}
      latestTitle={t("projectLatestMemory")}
      latestItems={latestItems}
      emptyMessage={t("projectSummaryEmpty")}
      actions={
        <button
          type="button"
          className="aops-v2-secondary-button"
          onClick={() => onNavigate?.("as-memory")}
          disabled={!onNavigate}
        >
          {t("projectOpenMemory")}
        </button>
      }
      t={t}
    />
  );
}

function ProjectDocsSummary({
  model,
  onNavigate,
  t
}: {
  model: DocmanDataModel;
  onNavigate?: (pageId: string) => void;
  t: (key: AopsCockpitTranslationKey) => string;
}) {
  const latestDocument = model.documents[0] ?? null;
  const latestItems: ProjectSummaryItem[] = latestDocument
    ? [
        {
          title: latestDocument.title ?? latestDocument.slug ?? latestDocument.documentUid ?? latestDocument.id,
          meta: latestDocument.groupUid ?? latestDocument.slug ?? shortId(latestDocument.id),
          status: latestDocument.status
        }
      ]
    : [];

  return (
    <ProjectSummaryPanel
      title={t("projectDocsTitle")}
      message={t("projectDocsMessage")}
      status={model.status}
      metrics={[
        { label: t("docsTitle"), value: model.documents.length },
        { label: t("projectDocGroups"), value: model.groups.length }
      ]}
      latestTitle={t("projectLatestDocs")}
      latestItems={latestItems}
      emptyMessage={t("projectSummaryEmpty")}
      actions={
        <button
          type="button"
          className="aops-v2-secondary-button"
          onClick={() => onNavigate?.("docs")}
          disabled={!onNavigate}
        >
          {t("projectOpenDocs")}
        </button>
      }
      t={t}
    />
  );
}

function ProjectSummaryPanel({
  title,
  message,
  status,
  metrics,
  latestTitle,
  latestItems,
  emptyMessage,
  actions,
  t
}: {
  title: string;
  message: string;
  status: "select-project" | "loading" | "error" | "empty" | "ready";
  metrics: ProjectSummaryMetric[];
  latestTitle: string;
  latestItems: ProjectSummaryItem[];
  emptyMessage: string;
  actions: ReactNode;
  t: (key: AopsCockpitTranslationKey) => string;
}) {
  const stateMessage =
    status === "loading"
      ? t("projectSummaryLoading")
      : status === "error"
        ? t("projectSummaryError")
        : status === "select-project" || status === "empty"
          ? emptyMessage
          : null;

  return (
    <section className="aops-project-detail-section">
      <div className="aops-project-detail-copy">
        <h5>{title}</h5>
        <p>{message}</p>
      </div>
      {stateMessage ? <p className="aops-project-summary-state">{stateMessage}</p> : null}
      <div className="aops-project-summary-metrics" role="list">
        {metrics.map((metric) => (
          <div className="aops-project-summary-metric" role="listitem" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>
      <div className="aops-project-summary-latest">
        <span className="aops-project-summary-heading">{latestTitle}</span>
        {latestItems.length ? (
          <ul className="aops-project-summary-list">
            {latestItems.map((item) => (
              <li className="aops-project-summary-item" key={`${item.title}:${item.meta ?? ""}`}>
                <span className="aops-project-summary-item-main" title={item.title}>
                  {oneLine(item.title, t("unknownValue"))}
                </span>
                <span className="aops-project-summary-item-meta">
                  {[item.meta, item.status].filter(Boolean).join(" / ") || t("unknownValue")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="aops-project-summary-state">{emptyMessage}</p>
        )}
      </div>
      <div className="aops-project-detail-actions">{actions}</div>
    </section>
  );
}

function ProjectActivityDashboard({
  events,
  onNavigate,
  locale,
  t
}: {
  events: ProjectActivityEvent[];
  onNavigate?: (pageId: string) => void;
  locale: AopsCockpitLocale;
  t: (key: AopsCockpitTranslationKey) => string;
}) {
  const [range, setRange] = useState<ProjectActivityRange>("week");
  const filteredEvents = useMemo(() => {
    if (range === "all") return events;
    const duration =
      range === "day" ? 24 * 60 * 60 * 1000 : range === "week" ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - duration;
    return events.filter((event) => event.epoch >= cutoff);
  }, [events, range]);
  const visibleEvents = filteredEvents.slice(0, 60);
  const groups = useMemo(() => groupProjectActivityEvents(visibleEvents, locale), [locale, visibleEvents]);
  const domainCount = new Set(filteredEvents.map((event) => event.domain)).size;
  const ranges: Array<{ id: ProjectActivityRange; label: string }> = [
    { id: "day", label: t("projectActivityRangeDay") },
    { id: "week", label: t("projectActivityRangeWeek") },
    { id: "month", label: t("projectActivityRangeMonth") },
    { id: "all", label: t("projectActivityRangeAll") }
  ];

  return (
    <section className="aops-project-detail-section aops-project-activity" data-testid="aops-project-activity">
      <div className="aops-project-activity-head">
        <div className="aops-project-detail-copy">
          <h5>{t("projectActivityTitle")}</h5>
          <p>{t("projectActivityMessage")}</p>
        </div>
        <div
          className="aops-project-activity-range eops-segmented"
          role="group"
          aria-label={t("projectActivityRangeLabel")}
        >
          {ranges.map((option) => (
            <button
              type="button"
              className={`eops-segmented-item${range === option.id ? " is-active" : ""}`}
              aria-pressed={range === option.id}
              onClick={() => setRange(option.id)}
              key={option.id}
              data-testid={`aops-project-activity-range-${option.id}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <p className="aops-project-activity-note">{t("projectActivitySnapshotNote")}</p>
      <dl className="aops-project-activity-metrics">
        <ProjectAttentionMetric label={t("projectActivityTotal")} value={events.length} />
        <ProjectAttentionMetric label={t("projectActivityVisible")} value={filteredEvents.length} />
        <ProjectAttentionMetric label={t("projectActivityDomains")} value={domainCount} />
        <div>
          <dt>{t("projectActivityLatest")}</dt>
          <dd>{formatProjectDate(events[0]?.timestamp ?? null, locale, t)}</dd>
        </div>
      </dl>
      {groups.length ? (
        <div className="aops-project-activity-groups">
          {groups.map((group) => (
            <section className="aops-project-activity-day" key={group.key}>
              <header>
                <time dateTime={group.key}>{group.label}</time>
                <span>{group.events.length} {t("projectActivityChanges")}</span>
              </header>
              <ol className="aops-project-activity-list">
                {group.events.map((event) => (
                  <li
                    className={`aops-project-activity-item is-${event.domain}`}
                    key={event.id}
                    data-testid="aops-project-activity-item"
                  >
                    <span className="aops-project-activity-rail" aria-hidden="true"><i /></span>
                    <div className="aops-project-activity-copy">
                      <div className="aops-project-activity-meta-row">
                        <span className="aops-project-activity-domain">{projectActivityDomainLabel(event.domain, t)}</span>
                        <time dateTime={event.timestamp}>{formatPmDate(event.timestamp, locale)}</time>
                      </div>
                      <strong title={event.title}>{oneLine(event.title, t("unknownValue"), 140)}</strong>
                      <span className="aops-project-activity-kind">
                        {[event.kind, event.status, event.meta].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="aops-project-activity-open"
                      onClick={() => onNavigate?.(event.pageId)}
                      disabled={!onNavigate}
                    >
                      {t("projectActivityOpen")}
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      ) : (
        <p className="aops-project-summary-state aops-project-activity-empty">{t("projectActivityEmpty")}</p>
      )}
    </section>
  );
}

function groupProjectActivityEvents(events: ProjectActivityEvent[], locale: AopsCockpitLocale) {
  const groups: Array<{ key: string; label: string; events: ProjectActivityEvent[] }> = [];
  for (const event of events) {
    const date = new Date(event.epoch);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = {
        key,
        label: new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
          weekday: "short",
          day: "numeric",
          month: "long",
          year: "numeric"
        }).format(date),
        events: []
      };
      groups.push(group);
    }
    group.events.push(event);
  }
  return groups;
}

function projectActivityDomainLabel(
  domain: ProjectActivityDomain,
  t: (key: AopsCockpitTranslationKey) => string
): string {
  if (domain === "planning") return t("projectDomainProjectman");
  if (domain === "memory") return t("projectDomainAgentspace");
  return t("projectDomainDocman");
}

function ProjectOverview({
  project,
  domainPulses,
  activityEvents,
  projectman,
  agentspace,
  onSelectTab,
  locale,
  t
}: {
  project: ProjectOption;
  domainPulses: ProjectDomainPulse[];
  activityEvents: ProjectActivityEvent[];
  projectman: ProjectmanDataModel;
  agentspace: AgentspaceDataModel;
  onSelectTab: (tabId: ProjectDetailTabId) => void;
  locale: AopsCockpitLocale;
  t: (key: AopsCockpitTranslationKey) => string;
}) {
  const openWork =
    projectman.issues.filter((issue) => isOpenStatus(issue.status)).length +
    projectman.feedback.filter((feedback) => isOpenStatus(feedback.status)).length;
  const pendingReviews = projectman.reviewRequests.filter((review) => isOpenStatus(review.status)).length;
  const activeMissions = agentspace.missions.filter((mission) =>
    !["completed", "closed", "cancelled", "archived"].includes(mission.status?.toLowerCase() ?? "")
  ).length;

  return (
    <section className="aops-project-detail-section aops-project-overview">
      <div className="aops-project-overview-section aops-project-pulse">
        <div className="aops-project-detail-copy">
          <h5>{t("projectPulseTitle")}</h5>
          <p>{t("projectPulseMessage")}</p>
        </div>
        <div className="aops-project-pulse-grid">
          {domainPulses.map((pulse) => (
            <button
              type="button"
              className={`aops-project-pulse-card is-${pulse.id}`}
              key={pulse.id}
              onClick={() => onSelectTab(pulse.tabId)}
              data-status={pulse.status}
              data-testid={`aops-project-pulse-${pulse.id}`}
            >
              <span className="aops-project-pulse-card-topline">
                <span className="aops-project-pulse-domain">
                  <i aria-hidden="true" />
                  {pulse.label}
                </span>
                <span className="aops-project-pulse-state">{projectDomainStatusLabel(pulse.status, t)}</span>
              </span>
              <strong>{pulse.count}</strong>
              <span className="aops-project-pulse-latest">
                {t("projectDomainLatest")} · {formatProjectDate(pulse.latestAt, locale, t)}
              </span>
            </button>
          ))}
        </div>
        <dl className="aops-project-attention-strip" aria-label={t("projectPulseTitle")}>
          <ProjectAttentionMetric label={t("projectPulseOpenWork")} value={openWork} />
          <ProjectAttentionMetric label={t("projectPulsePendingReviews")} value={pendingReviews} />
          <ProjectAttentionMetric label={t("projectPulseActiveMissions")} value={activeMissions} />
        </dl>
      </div>
      <div className="aops-project-overview-lower aops-project-card-divider">
        <div className="aops-project-overview-section aops-project-identity-card">
          <div className="aops-project-detail-copy">
            <h5>{t("projectOverviewTitle")}</h5>
            <p>{t("projectOverviewMessage")}</p>
          </div>
          <dl className="aops-project-detail-grid">
            <DetailRow label={t("projectSlug")} value={project.slug} t={t} />
            <DetailRow label={t("projectStatus")} value={project.status} t={t} />
            <DetailRow label={t("projectVisibility")} value={project.visibility} t={t} />
            <DetailRow label={t("projectType")} value={project.projectType} t={t} />
            <DetailRow label={t("projectScope")} value={project.scopeId} t={t} />
            <DetailRow label={t("projectId")} value={project.projectId} t={t} />
            <DetailRow label={t("projectKey")} value={project.key} t={t} />
            </dl>
        </div>
        <ProjectLatestDayTimeline
          events={activityEvents}
          onSelectTab={onSelectTab}
          locale={locale}
          t={t}
        />
      </div>
    </section>
  );
}

function ProjectLatestDayTimeline({
  events,
  onSelectTab,
  locale,
  t
}: {
  events: ProjectActivityEvent[];
  onSelectTab: (tabId: ProjectDetailTabId) => void;
  locale: AopsCockpitLocale;
  t: (key: AopsCockpitTranslationKey) => string;
}) {
  const latestGroup = groupProjectActivityEvents(events, locale)[0];
  const visibleEvents = latestGroup?.events.slice(0, 7).reverse() ?? [];

  return (
    <section className="aops-project-latest-day" data-testid="aops-project-latest-day">
      <header className="aops-project-latest-day-head">
        <div className="aops-project-detail-copy">
          <h5>{t("projectLatestDayTitle")}</h5>
          <p>
            {latestGroup
              ? `${latestGroup.label} · ${latestGroup.events.length} ${t("projectActivityChanges")}`
              : t("projectLatestDayMessage")}
          </p>
        </div>
        <button
          type="button"
          className="aops-project-latest-day-open"
          onClick={() => onSelectTab("activity")}
          data-testid="aops-project-latest-day-open"
        >
          {t("projectLatestDayOpenAll")}
          <span aria-hidden="true">→</span>
        </button>
      </header>
      {visibleEvents.length ? (
        <ol className="aops-project-latest-day-list">
          {visibleEvents.map((event) => (
            <li
              className={`aops-project-latest-day-item is-${event.domain}`}
              key={event.id}
              data-testid="aops-project-latest-day-item"
              data-epoch={event.epoch}
            >
              <button type="button" onClick={() => onSelectTab(event.domain)}>
                <time dateTime={event.timestamp}>{formatProjectTime(event.timestamp, locale)}</time>
                <span className="aops-project-latest-day-icon" aria-hidden="true">
                  <ProjectActivityIcon domain={event.domain} />
                </span>
                <span className="aops-project-latest-day-copy">
                  <strong title={event.title}>{oneLine(event.title, t("unknownValue"), 92)}</strong>
                  <span>{projectActivityDomainLabel(event.domain, t)} · {event.kind}</span>
                </span>
                <span className="aops-project-latest-day-ref">
                  {oneLine(event.status ?? event.meta ?? event.kind, t("unknownValue"), 24)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="aops-project-summary-state aops-project-latest-day-empty">{t("projectLatestDayEmpty")}</p>
      )}
    </section>
  );
}

function ProjectActivityIcon({ domain }: { domain: ProjectActivityDomain }) {
  if (domain === "memory") {
    return (
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M9 5a3 3 0 0 0-5 2.2A3.2 3.2 0 0 0 3 13a3.4 3.4 0 0 0 4 4.8A3 3 0 0 0 12 20V4A3 3 0 0 0 9 5Zm6 0a3 3 0 0 1 5 2.2A3.2 3.2 0 0 1 21 13a3.4 3.4 0 0 1-4 4.8A3 3 0 0 1 12 20V4a3 3 0 0 1 3 1Z" />
        <path d="M7 10h2m6 0h2M8 15h2m4 0h2" />
      </svg>
    );
  }
  if (domain === "docs") {
    return (
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M6 3h8l4 4v14H6V3Z" />
        <path d="M14 3v5h5M9 12h6m-6 4h6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" focusable="false">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9 4v16m6-16v16M6 8h2m3 4h2m3 4h2" />
    </svg>
  );
}

function formatProjectTime(value: string, locale: AopsCockpitLocale): string {
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) return "--:--";
  return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(epoch));
}

function ProjectAttentionMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function projectDomainStatusLabel(
  status: ProjectDomainPulse["status"],
  t: (key: AopsCockpitTranslationKey) => string
): string {
  if (status === "loading") return t("projectDomainLoading");
  if (status === "error") return t("projectDomainError");
  if (status === "empty" || status === "select-project") return t("projectDomainEmpty");
  return t("projectDomainReady");
}

function formatProjectDate(
  value: string | null | undefined,
  locale: AopsCockpitLocale,
  t: (key: AopsCockpitTranslationKey) => string
): string {
  return value ? formatPmDate(value, locale) : t("unknownValue");
}

function buildProjectActivityEvents({
  projectman,
  agentspace,
  docman,
  t
}: {
  projectman: ProjectmanDataModel;
  agentspace: AgentspaceDataModel;
  docman: DocmanDataModel;
  t: (key: AopsCockpitTranslationKey) => string;
}): ProjectActivityEvent[] {
  const events: ProjectActivityEvent[] = [];
  const add = (event: Omit<ProjectActivityEvent, "epoch">) => {
    const epoch = Date.parse(event.timestamp);
    if (!Number.isFinite(epoch)) return;
    events.push({ ...event, epoch });
  };

  for (const board of projectman.boards) {
    add({
      id: `board:${board.id}`,
      domain: "planning",
      kind: t("pmBoards"),
      title: board.name ?? board.slug ?? board.id,
      meta: shortId(board.id),
      status: isArchivedPmRecord(board) ? "archived" : null,
      timestamp: board.archivedAt ?? board.updatedAt ?? board.createdAt,
      pageId: "pm-boards"
    });
  }
  for (const task of projectman.tasks) {
    add({
      id: `task:${task.id}`,
      domain: "planning",
      kind: t("pmTasks"),
      title: task.title ?? task.id,
      meta: shortId(task.id),
      status: task.status,
      timestamp: task.updatedAt ?? task.createdAt,
      pageId: "pm-boards"
    });
  }
  for (const sprint of projectman.sprints) {
    add({
      id: `sprint:${sprint.id}`,
      domain: "planning",
      kind: t("pmSprints"),
      title: sprint.name ?? sprint.id,
      meta: shortId(sprint.id),
      status: sprint.status,
      timestamp: sprint.archivedAt ?? sprint.updatedAt ?? sprint.createdAt,
      pageId: "pm-sprints"
    });
  }
  for (const plan of projectman.implementationPlans) {
    add({
      id: `plan:${plan.id}`,
      domain: "planning",
      kind: t("pmPlans"),
      title: plan.name ?? plan.id,
      meta: shortId(plan.id),
      status: plan.status,
      timestamp: plan.updatedAt ?? plan.createdAt ?? "",
      pageId: "pm-sprints"
    });
  }
  for (const issue of projectman.issues) {
    add({
      id: `issue:${issue.id}`,
      domain: "planning",
      kind: t("pmIssues"),
      title: issue.title ?? issue.id,
      meta: issue.severity ?? shortId(issue.id),
      status: issue.status,
      timestamp: issue.updatedAt ?? issue.createdAt,
      pageId: "pm-issues"
    });
  }
  for (const feedback of projectman.feedback) {
    add({
      id: `feedback:${feedback.id}`,
      domain: "planning",
      kind: t("pmFeedback"),
      title: feedback.title ?? feedback.id,
      meta: feedback.type ?? feedback.severity ?? shortId(feedback.id),
      status: feedback.status,
      timestamp: feedback.updatedAt ?? feedback.createdAt,
      pageId: "pm-feedback"
    });
  }
  for (const review of projectman.reviewRequests) {
    add({
      id: `review:${review.id}`,
      domain: "planning",
      kind: t("pmReviews"),
      title: review.title ?? review.id,
      meta: review.targetAgent ?? review.requestedBy ?? shortId(review.id),
      status: review.status,
      timestamp: review.updatedAt ?? review.createdAt,
      pageId: "pm-reviews"
    });
    for (const result of review.results ?? []) {
      add({
        id: `review-result:${review.id}:${result.id}`,
        domain: "planning",
        kind: t("pmReviews"),
        title: result.summary ?? review.title ?? result.id,
        meta: result.reviewer ?? shortId(review.id),
        status: result.outcome,
        timestamp: result.createdAt,
        pageId: "pm-reviews"
      });
    }
  }

  for (const memory of agentspace.memoryItems) {
    add({
      id: `memory:${memory.id}`,
      domain: "memory",
      kind: t("asSectionMemory"),
      title: oneLine(memory.content, memory.kind ?? memory.id, 140),
      meta: memory.kind ?? shortId(memory.id),
      status: memory.durability,
      timestamp: memory.updatedAt ?? memory.createdAt ?? "",
      pageId: "as-memory"
    });
  }
  for (const mission of agentspace.missions) {
    add({
      id: `mission:${mission.id}`,
      domain: "memory",
      kind: t("asSectionMissions"),
      title: mission.objective ?? mission.slug ?? mission.id,
      meta: mission.slug ?? shortId(mission.id),
      status: mission.status,
      timestamp: mission.updatedAt ?? mission.createdAt ?? "",
      pageId: "as-missions"
    });
  }
  for (const discussion of agentspace.discussions) {
    add({
      id: `discussion:${discussion.id}`,
      domain: "memory",
      kind: t("asSectionDiscussions"),
      title: discussion.title ?? discussion.question ?? discussion.slug ?? discussion.id,
      meta: discussion.participants?.join(", ") ?? shortId(discussion.id),
      status: discussion.status,
      timestamp: discussion.lastTurnAt ?? discussion.updatedAt ?? discussion.createdAt ?? "",
      pageId: "as-discussions"
    });
  }
  for (const prompt of agentspace.prompts) {
    add({
      id: `prompt:${prompt.id}`,
      domain: "memory",
      kind: t("asSectionPrompts"),
      title: prompt.name ?? prompt.id,
      meta: shortId(prompt.id),
      status: prompt.status,
      timestamp: prompt.updatedAt ?? prompt.createdAt ?? "",
      pageId: "as-prompts"
    });
  }
  for (const skill of agentspace.skills) {
    add({
      id: `skill:${skill.id}`,
      domain: "memory",
      kind: t("asSectionSkills"),
      title: skill.name ?? skill.id,
      meta: shortId(skill.id),
      status: skill.status,
      timestamp: skill.updatedAt ?? skill.createdAt ?? "",
      pageId: "as-skills"
    });
  }
  for (const artifact of agentspace.artifacts) {
    add({
      id: `artifact:${artifact.id}`,
      domain: "memory",
      kind: t("asSectionArtifacts"),
      title: artifact.label ?? artifact.storagePath ?? artifact.id,
      meta: artifact.artifactType ?? shortId(artifact.id),
      timestamp: artifact.updatedAt ?? artifact.createdAt ?? "",
      pageId: "as-artifacts"
    });
  }
  for (const resource of agentspace.resources) {
    add({
      id: `resource:${resource.id}`,
      domain: "memory",
      kind: t("asSectionResources"),
      title: resource.name ?? resource.uri ?? resource.id,
      meta: resource.resourceType ?? shortId(resource.id),
      timestamp: resource.updatedAt ?? resource.createdAt ?? "",
      pageId: "as-resources"
    });
  }
  for (const profile of agentspace.agentProfiles) {
    add({
      id: `agent:${profile.id}`,
      domain: "memory",
      kind: t("asSectionAgents"),
      title: profile.name ?? profile.slug ?? profile.id,
      meta: profile.role ?? profile.kind ?? shortId(profile.id),
      timestamp: profile.updatedAt ?? profile.createdAt ?? "",
      pageId: "as-agents"
    });
  }

  for (const document of docman.documents) {
    add({
      id: `document:${document.id}`,
      domain: "docs",
      kind: t("docsTitle"),
      title: document.title ?? document.slug ?? document.documentUid ?? document.id,
      meta: document.groupUid ?? document.slug ?? shortId(document.id),
      status: document.status,
      timestamp: document.updatedAt ?? document.createdAt ?? "",
      pageId: "docs"
    });
  }

  return events.sort((a, b) => b.epoch - a.epoch);
}

function DetailRow({
  label,
  value,
  t
}: {
  label: string;
  value: string | null;
  t: (key: AopsCockpitTranslationKey) => string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd title={value?.trim() || undefined}>{value?.trim() ? value : t("unknownValue")}</dd>
    </div>
  );
}

function byUpdatedDesc<T extends { updatedAt?: string; createdAt?: string }>(a: T, b: T): number {
  return Date.parse(b.updatedAt ?? b.createdAt ?? "") - Date.parse(a.updatedAt ?? a.createdAt ?? "");
}

function oneLine(value: string | null | undefined, fallback: string, maxLength = 96): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim() || fallback;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}
