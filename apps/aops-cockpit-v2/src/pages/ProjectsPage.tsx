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
import type { AopsCockpitTranslationKey } from "../lib/i18n";
import { isArchivedPmRecord, isOpenStatus, shortId, type ProjectmanDataModel } from "../lib/projectman";
import type { ProjectsNavigator } from "../lib/projectsNavigator";
import type { ProjectOption } from "../lib/projects";

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
  t: (key: AopsCockpitTranslationKey) => string;
}

type ProjectDetailTabId = "overview" | "planning" | "memory" | "docs";

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
  }
];

export function ProjectsPage({
  model,
  navigator,
  projectman,
  agentspace,
  docman,
  onNavigate,
  onOpenPlan,
  t
}: ProjectsPageProps) {
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
            disabled={model.isFetching}
            onClick={model.onRefresh}
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
  t
}: {
  model: ProjectsPageModel;
  navigator: ProjectsNavigator;
  projectman: ProjectmanDataModel;
  agentspace: AgentspaceDataModel;
  docman: DocmanDataModel;
  onNavigate?: (pageId: string) => void;
  onOpenPlan?: (planId: string) => void;
  t: (key: AopsCockpitTranslationKey) => string;
}) {
  const [activeTab, setActiveTab] = useState<ProjectDetailTabId>("overview");
  const selectedProject = model.selectedProject;
  const tabCounts = useMemo(
    () => ({
      planning:
        projectman.boards.length +
        projectman.tasks.length +
        projectman.sprints.length +
        projectman.implementationPlans.length,
      memory:
        agentspace.memoryItems.length +
        agentspace.missions.length +
        agentspace.discussions.length,
      docs: docman.documents.length
    }),
    [
      agentspace.discussions.length,
      agentspace.memoryItems.length,
      agentspace.missions.length,
      docman.documents.length,
      projectman.boards.length,
      projectman.implementationPlans.length,
      projectman.sprints.length,
      projectman.tasks.length
    ]
  );
  const tabs = useMemo<ProjectDetailTabItem[]>(
    () =>
      PROJECT_DETAIL_TABS.map((tab) => ({
        id: tab.id,
        label: t(tab.labelKey),
        title: t(tab.hintKey),
        count: tab.id === "overview" ? undefined : tabCounts[tab.id],
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
      onNavigate={onNavigate}
      onOpenPlan={onOpenPlan}
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
        projectCount={model.projects.length}
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
  projectCount,
  t
}: {
  project: ProjectOption | null;
  projectCount: number;
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
        <ProjectHeroMetric
          label={t("projectId")}
          value={compactId(project?.projectId)}
          fullValue={project?.projectId}
          t={t}
        />
        <ProjectHeroMetric label={t("projectType")} value={project?.projectType ?? null} t={t} />
        <ProjectHeroMetric label={t("projectCount")} value={String(projectCount)} t={t} />
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
  onNavigate,
  onOpenPlan,
  t
}: {
  project: ProjectOption;
  activeTab: ProjectDetailTabId;
  projectman: ProjectmanDataModel;
  agentspace: AgentspaceDataModel;
  docman: DocmanDataModel;
  onNavigate?: (pageId: string) => void;
  onOpenPlan?: (planId: string) => void;
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
        {activeTab === "overview" ? <ProjectOverview project={project} t={t} /> : null}
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

function ProjectOverview({
  project,
  t
}: {
  project: ProjectOption;
  t: (key: AopsCockpitTranslationKey) => string;
}) {
  return (
    <section className="aops-project-detail-section aops-project-overview">
      <div className="aops-project-overview-section">
        <div className="aops-project-detail-copy">
          <h5>{t("projectOverviewTitle")}</h5>
          <p>{t("projectOverviewMessage")}</p>
        </div>
        <dl className="aops-project-detail-grid">
          <DetailRow label={t("projectSlug")} value={project.slug} t={t} />
          <DetailRow label={t("projectStatus")} value={project.status} t={t} />
          <DetailRow label={t("projectVisibility")} value={project.visibility} t={t} />
          <DetailRow label={t("projectType")} value={project.projectType} t={t} />
        </dl>
      </div>
      <div className="aops-project-overview-section aops-project-card-divider">
        <span className="aops-project-section-eyebrow">{t("projectScope")}</span>
        <dl className="aops-project-detail-grid">
          <DetailRow label={t("projectScope")} value={project.scopeId} t={t} />
          <DetailRow label={t("projectId")} value={project.projectId} t={t} />
        </dl>
      </div>
      <div className="aops-project-overview-section aops-project-card-divider">
        <span className="aops-project-section-eyebrow">{t("projectReferences")}</span>
        <dl className="aops-project-detail-grid">
          <DetailRow label={t("projectKey")} value={project.key} t={t} />
        </dl>
      </div>
    </section>
  );
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
