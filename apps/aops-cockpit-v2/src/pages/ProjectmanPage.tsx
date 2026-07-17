import { useEffect, useState, type ReactNode } from "react";
import { WorkbenchSectionShell, WorkbenchStatePanel } from "@aopslab/xf-ui-shell-react";
import { apiErrorMessage } from "../lib/aopsApi";
import { PROJECTMAN_SECTIONS, projectmanPageIdForSection, type ProjectmanSectionId } from "../lib/sections";
import { shortId } from "../lib/projectman";
import { ProjectmanBoards } from "./projectman/ProjectmanBoards";
import { ProjectmanSprintsPlans } from "./projectman/ProjectmanSprintsPlans";
import { countSprintPlanRecords } from "./projectman/helpers";
import {
  buildFeedbackItems,
  buildIssueItems,
  buildReviewItems
} from "./projectman/ProjectmanRecordList";
import { ProjectmanRecordSection } from "./projectman/ProjectmanRecordSection";
import { CockpitViewIconSwitch } from "../components/CockpitViewIconSwitch";
import {
  readRecordCardsUiState,
  writeRecordCardsUiState,
  type RecordCardsUiState
} from "./projectman/record-cards/shared";
import type { ProjectmanDispatcherProps, TFn } from "./projectman/types";

type ProjectmanSectionViewMode = "side-panel" | "cards" | "dropdown" | "list";

// A2 multi-tab dispatcher. The project-dropdown band lives in the shell thin-bar
// slot (a full-width strip below the header, aops-cockpit style); this page owns
// the section tabs (Boards / Sprints / Issues / Feedback / Reviews) + the active
// section body. The active section comes from the routed page id; switching a tab
// routes to the section's page id so the two-level left menu stays in sync.
export function ProjectmanPage({
  model,
  boardsNavigator,
  selectedBoardId,
  sprintsNavigator,
  selectedSprintKey,
  section,
  onNavigate,
  locale,
  t
}: ProjectmanDispatcherProps) {
  const sectionCounts: Record<ProjectmanSectionId, number> = {
    boards: model.boards.length,
    sprints: countSprintPlanRecords(model.sprints, model.implementationPlans),
    issues: model.issues.length,
    feedback: model.feedback.length,
    reviews: model.reviewRequests.length
  };

  const tabs = PROJECTMAN_SECTIONS.map((entry) => ({
    id: entry.section,
    label: t(entry.labelKey),
    count: sectionCounts[entry.section] || null
  }));
  const [recordCardsUi, setRecordCardsUi] = useState<RecordCardsUiState>(readRecordCardsUiState);
  useEffect(() => {
    if (section === "boards" && boardsNavigator.viewMode === "navigator") {
      boardsNavigator.switchMode("left-menu");
      return;
    }
    if (section === "sprints" && sprintsNavigator.viewMode === "navigator") {
      sprintsNavigator.switchMode("left-menu");
    }
  }, [
    boardsNavigator.switchMode,
    boardsNavigator.viewMode,
    section,
    sprintsNavigator.switchMode,
    sprintsNavigator.viewMode
  ]);
  const projectKey = model.selectedProject?.key ?? "__global__";
  const viewKey = `${projectKey}:${section}`;
  const recordSectionView = recordCardsUi.viewBySection[viewKey] ?? recordCardsUi.viewBySection[section] ?? "cards";
  const viewMode: ProjectmanSectionViewMode =
    section === "boards"
      ? boardsNavigator.viewMode === "cards"
        ? "cards"
        : boardsNavigator.viewMode === "left-menu"
          ? "side-panel"
          : "dropdown"
      : section === "sprints"
        ? sprintsNavigator.viewMode === "cards"
          ? "cards"
          : sprintsNavigator.viewMode === "left-menu"
            ? "side-panel"
            : "dropdown"
        : recordSectionView === "dropdown"
          ? "dropdown"
          : recordSectionView === "side-panel" || recordSectionView === "list"
            ? "side-panel"
            : "cards";
  const setViewMode = (next: ProjectmanSectionViewMode) => {
    if (section === "boards") {
      boardsNavigator.switchMode(
        next === "cards" ? "cards" : next === "dropdown" ? "dropdown" : "left-menu"
      );
      return;
    }
    if (section === "sprints") {
      sprintsNavigator.switchMode(
        next === "cards" ? "cards" : next === "dropdown" ? "dropdown" : "left-menu"
      );
      return;
    }
    setRecordCardsUi((previous) => {
      const nextState = { ...previous, viewBySection: { ...previous.viewBySection, [viewKey]: next } };
      writeRecordCardsUiState(nextState);
      return nextState;
    });
  };
  const activeNavigator = section === "boards" ? boardsNavigator : section === "sprints" ? sprintsNavigator : null;

  return (
    <WorkbenchSectionShell className="aops-v2-section aops-pm-section" mainClassName="aops-v2-section-main">
      <div className={`aops-pm-dispatch has-view-switch is-${section} is-${viewMode}`}>
        <label className="aops-pm-mobile-section-picker">
          <span>{t("pmTitle")}</span>
          <select
            aria-label={t("pmTitle")}
            value={section}
            onChange={(event) =>
              onNavigate(projectmanPageIdForSection(event.target.value as ProjectmanSectionId))
            }
          >
            {tabs.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.label}{tab.count != null ? ` (${tab.count})` : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="aops-pm-section-controls">
          <div className="aops-pm-sectiontabs" role="tablist" aria-label={t("pmTitle")}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={section === tab.id}
                className={`aops-pm-sectiontab${section === tab.id ? " is-active" : ""}`}
                onClick={() => onNavigate(projectmanPageIdForSection(tab.id))}
              >
                <span className="aops-pm-sectiontab-label">{tab.label}</span>
                {tab.count != null ? <span className="aops-pm-sectiontab-count">{tab.count}</span> : null}
              </button>
            ))}
          </div>
          <ProjectmanViewSwitch
            section={section}
            value={viewMode}
            sidePanelOpen={activeNavigator?.controller.open ?? true}
            onSidePanelToggle={() => {
              if (!activeNavigator) {
                setViewMode("side-panel");
                return;
              }
              if (viewMode === "side-panel") {
                activeNavigator.controller.setOpen((current) => !current);
                return;
              }
              activeNavigator.controller.setOpen(true);
              setViewMode("side-panel");
            }}
            onChange={setViewMode}
            t={t}
          />
        </div>
        <div className="aops-pm-dispatch-body">
          <ProjectmanSectionBody
            section={section}
            model={model}
            boardsNavigator={boardsNavigator}
            selectedBoardId={selectedBoardId}
            sprintsNavigator={sprintsNavigator}
            selectedSprintKey={selectedSprintKey}
            viewMode={viewMode}
            locale={locale}
            t={t}
          />
        </div>
      </div>
    </WorkbenchSectionShell>
  );
}

function ProjectmanViewSwitch({
  section,
  value,
  sidePanelOpen,
  onSidePanelToggle,
  onChange,
  t
}: {
  section: ProjectmanSectionId;
  value: ProjectmanSectionViewMode;
  sidePanelOpen: boolean;
  onSidePanelToggle: () => void;
  onChange: (value: ProjectmanSectionViewMode) => void;
  t: TFn;
}): ReactNode {
  const sectionDef = PROJECTMAN_SECTIONS.find((entry) => entry.section === section) ?? PROJECTMAN_SECTIONS[0];
  const supportsClosablePanel = section === "boards" || section === "sprints";
  const panelVisible = value === "side-panel" && sidePanelOpen;
  const panelLabel = supportsClosablePanel
    ? panelVisible
      ? t("navSidePanelHide")
      : t("navSidePanelShow")
    : t("pmRecordViewSidePanel");
  return (
    <CockpitViewIconSwitch
      ariaLabel={`${t("pmRecordViewLabel")}: ${t(sectionDef.labelKey)}`}
      value={value}
      items={[
        {
          value: "side-panel",
          label: panelLabel,
          icon: "side-panel",
          expanded: supportsClosablePanel ? panelVisible : value === "side-panel",
          onSelect: onSidePanelToggle,
          testId: `aops-pm-${section}-view-side-panel`
        },
        { value: "cards", label: t("navModeCards"), icon: "cards", testId: `aops-pm-${section}-view-cards` },
        { value: "dropdown", label: t("navModeDropdown"), icon: "dropdown", testId: `aops-pm-${section}-view-dropdown` }
      ]}
      onChange={onChange}
    />
  );
}

function ProjectmanSectionBody({
  section,
  model,
  boardsNavigator,
  selectedBoardId,
  sprintsNavigator,
  selectedSprintKey,
  viewMode,
  locale,
  t
}: {
  section: ProjectmanSectionId;
  model: ProjectmanDispatcherProps["model"];
  boardsNavigator: ProjectmanDispatcherProps["boardsNavigator"];
  selectedBoardId: string | null;
  sprintsNavigator: ProjectmanDispatcherProps["sprintsNavigator"];
  selectedSprintKey: string | null;
  viewMode: ProjectmanSectionViewMode;
  locale: ProjectmanDispatcherProps["locale"];
  t: TFn;
}): ReactNode {
  if (model.status === "select-project") {
    return <WorkbenchStatePanel variant="empty" title={t("pmNoProjectTitle")} message={t("pmNoProjectMessage")} />;
  }
  if (model.status === "loading") {
    return <WorkbenchStatePanel variant="loading" title={t("pmLoadingTitle")} message={t("pmLoadingMessage")} />;
  }
  if (model.status === "error") {
    return (
      <WorkbenchStatePanel
        variant="error"
        title={t("pmErrorTitle")}
        message={apiErrorMessage(model.error, "projectman_unavailable")}
        actions={
          <button type="button" className="aops-v2-secondary-button" onClick={model.refresh}>
            {t("authRetry")}
          </button>
        }
      />
    );
  }
  if (model.status === "empty") {
    return <WorkbenchStatePanel variant="empty" title={t("pmEmptyTitle")} message={t("pmEmptyMessage")} />;
  }
  // status === "ready"
  if (section === "boards")
    return (
      <ProjectmanBoards
        model={model}
        navigator={boardsNavigator}
        selectedBoardId={selectedBoardId}
        locale={locale}
        t={t}
      />
    );
  if (section === "sprints")
    return (
      <ProjectmanSprintsPlans
        model={model}
        navigator={sprintsNavigator}
        selectedKey={selectedSprintKey}
        locale={locale}
        t={t}
      />
    );

  // Issues / Feedback / Reviews — lighter searchable master-detail surfaces.
  const sprintName = (id?: string | null): string | null =>
    id ? model.sprints.find((sprint) => sprint.id === id)?.name ?? shortId(id) : null;
  const taskTitle = (id?: string | null): string | null =>
    id ? model.tasks.find((task) => task.id === id)?.title ?? shortId(id) : null;
  if (section === "issues") {
    return (
      <ProjectmanRecordSection
        model={model}
        section="issues"
        deleteResource="issues"
        items={buildIssueItems(model.issues, sprintName, taskTitle, t)}
        title={t("pmSectionIssues")}
        searchPlaceholder={t("pmSearchIssues")}
        emptyLabel={t("pmNoIssues")}
        view={viewMode}
        locale={locale}
        t={t}
      />
    );
  }
  if (section === "feedback") {
    return (
      <ProjectmanRecordSection
        model={model}
        section="feedback"
        deleteResource="feedbacks"
        items={buildFeedbackItems(model.feedback, t)}
        title={t("pmSectionFeedback")}
        searchPlaceholder={t("pmSearchFeedback")}
        emptyLabel={t("pmNoFeedback")}
        view={viewMode}
        locale={locale}
        t={t}
      />
    );
  }
  return (
    <ProjectmanRecordSection
      model={model}
      section="reviews"
      deleteResource="review-requests"
      items={buildReviewItems(model.reviewRequests, sprintName, taskTitle, t)}
      title={t("pmSectionReviews")}
      searchPlaceholder={t("pmSearchReviews")}
      emptyLabel={t("pmNoReviews")}
      view={viewMode}
      locale={locale}
      t={t}
    />
  );
}
