import { Fragment, type ReactNode } from "react";
import { WorkbenchDetailTabs } from "@aopslab/xf-ui-composition-react";
import { toneForStatus, type CockpitPmPhase } from "../../lib/projectman";
import { Badge, EmptyLine, SegmentedControl } from "./components";
import { PhaseList, PlanTextList } from "./PlanDetailParts";
import { SprintTimeline } from "./SprintTimeline";
import { buildSprintStatusRollup } from "./helpers";
import type { AopsCockpitTranslationKey } from "../../lib/i18n";
import type { NormalizedPlanDetail, TFn } from "./types";

// Shared sprint/plan detail surfaces: the tabbed detail body (Phases / Scope /
// Validation / References / Tasks) and the status rollup chips. Used by the
// Sprints page record detail AND by the cards-mode register (each expanded
// sprint card hosts its OWN detail body).

export type SprintTabId = "phases" | "scope" | "validation" | "references" | "tasks";
export type SprintPhaseView = "timeline" | "accordion" | "table";

// aops-desktop progressStatusChips label map (fixed order, zeros included).
export const ROLLUP_LABEL_KEYS: Record<string, AopsCockpitTranslationKey> = {
  todo: "pmRollupTodo",
  doing: "pmRollupDoing",
  blocked: "pmRollupBlocked",
  paused: "pmRollupPaused",
  in_review: "pmRollupInReview",
  postponed: "pmRollupPostponed",
  cancelled: "pmRollupCancelled",
  completed: "pmRollupCompleted"
};

/** Status rollup chip strip (aops-desktop progressStatusChips grammar). */
export function SprintRollupChips({ detail, t }: { detail: NormalizedPlanDetail; t: TFn }): ReactNode {
  if (!detail.phases.length) return null;
  return (
    <div className="aops-pm-sprint-rollup" role="list" aria-label={t("pmFieldStatus")}>
      {buildSprintStatusRollup(detail).map((chip) => (
        <span
          key={chip.id}
          role="listitem"
          className={`aops-pm-rollup-item${chip.value > 0 ? " has-count" : ""}${
            chip.id === "completed" && chip.total && chip.value >= chip.total ? " is-done" : ""
          }`}
        >
          <span className="aops-pm-rollup-label">{t(ROLLUP_LABEL_KEYS[chip.id])}</span>
          <span className="aops-pm-rollup-count">
            {chip.id === "completed" ? `${chip.value}/${chip.total ?? 0}` : chip.value}
          </span>
        </span>
      ))}
    </div>
  );
}

export interface SprintTaskRow {
  id: string;
  title: string;
  status: string | null;
}

/** The tabbed sprint/plan detail body (no record header — callers own that). */
export function SprintDetailBody({
  detail,
  activeTab,
  onTab,
  phaseView,
  onPhaseView,
  openPhases,
  onTogglePhase,
  onSetAllPhases,
  microtaskQuery,
  onMicrotaskQuery,
  linkedTaskTitle,
  sprintTasks,
  compact = false,
  t
}: {
  detail: NormalizedPlanDetail;
  activeTab: SprintTabId;
  onTab: (id: SprintTabId) => void;
  phaseView: SprintPhaseView;
  onPhaseView: (view: SprintPhaseView) => void;
  openPhases: Record<string, boolean>;
  onTogglePhase: (id: string) => void;
  /** Expand/collapse ALL phases (per-card toolbar gain); omit to hide buttons. */
  onSetAllPhases?: (open: boolean) => void;
  /** Microtask search (filters rows, force-opens matching phases); omit to hide. */
  microtaskQuery?: string;
  onMicrotaskQuery?: (value: string) => void;
  linkedTaskTitle: string | null;
  sprintTasks: SprintTaskRow[];
  /** Compact controls (cards-mode expanded body). */
  compact?: boolean;
  t: TFn;
}): ReactNode {
  const tasksCount = (detail.taskId ? 1 : 0) + sprintTasks.length;
  const query = (microtaskQuery ?? "").trim().toLowerCase();
  const phases = query
    ? detail.phases
        .map((phase) => ({
          ...phase,
          microtasks: (phase.microtasks ?? []).filter((microtask) =>
            `${microtask.title} ${microtask.notes ?? ""}`.toLowerCase().includes(query)
          )
        }))
        .filter((phase) => (phase.microtasks ?? []).length > 0)
    : detail.phases;
  // A live search force-opens the (matching) phases so hits are visible.
  const effectiveOpenPhases = query
    ? Object.fromEntries(phases.map((phase) => [phase.id, true]))
    : openPhases;
  const tabs = [
    { id: "phases", label: t("pmPhasesTab"), count: detail.phases.length || null },
    { id: "scope", label: t("pmScopeTitle"), count: detail.scope.length || null },
    { id: "validation", label: t("pmValidationTitle"), count: detail.validationPlan.length || null },
    { id: "references", label: t("pmReferencesTab"), count: detail.references.length || null },
    { id: "tasks", label: t("pmTasksTab"), count: tasksCount || null }
  ];
  return (
    <>
      <WorkbenchDetailTabs
        className="aops-pm-detail-tabs"
        items={tabs}
        activeId={activeTab}
        onChange={(id: string) => onTab(id as SprintTabId)}
        ariaLabel={t("pmSprintsPlansTitle")}
      />
      <div className="aops-pm-tabbody">
        {activeTab === "phases" ? (
          <PhasesTab
            detail={detail}
            phases={phases}
            allEmpty={detail.phases.length === 0}
            phaseView={phaseView}
            onPhaseView={onPhaseView}
            openPhases={effectiveOpenPhases}
            onTogglePhase={onTogglePhase}
            onSetAllPhases={onSetAllPhases}
            microtaskQuery={microtaskQuery}
            onMicrotaskQuery={onMicrotaskQuery}
            compact={compact}
            t={t}
          />
        ) : activeTab === "scope" ? (
          detail.scope.length ? (
            <PlanTextList title={t("pmScopeTitle")} rows={detail.scope} />
          ) : (
            <EmptyLine t={t} />
          )
        ) : activeTab === "validation" ? (
          detail.validationPlan.length ? (
            <PlanTextList title={t("pmValidationTitle")} rows={detail.validationPlan} />
          ) : (
            <EmptyLine t={t} />
          )
        ) : activeTab === "references" ? (
          detail.references.length ? (
            <PlanTextList title={t("pmReferencesTab")} rows={detail.references} />
          ) : (
            <EmptyLine t={t} />
          )
        ) : (
          <TasksTab linkedTaskTitle={linkedTaskTitle} tasks={sprintTasks} t={t} />
        )}
      </div>
    </>
  );
}

function PhasesTab({
  detail,
  phases,
  allEmpty,
  phaseView,
  onPhaseView,
  openPhases,
  onTogglePhase,
  onSetAllPhases,
  microtaskQuery,
  onMicrotaskQuery,
  compact,
  t
}: {
  detail: NormalizedPlanDetail;
  phases: CockpitPmPhase[];
  allEmpty: boolean;
  phaseView: SprintPhaseView;
  onPhaseView: (view: SprintPhaseView) => void;
  openPhases: Record<string, boolean>;
  onTogglePhase: (id: string) => void;
  onSetAllPhases?: (open: boolean) => void;
  microtaskQuery?: string;
  onMicrotaskQuery?: (value: string) => void;
  compact: boolean;
  t: TFn;
}): ReactNode {
  if (allEmpty) return <EmptyLine t={t} />;
  const searching = Boolean((microtaskQuery ?? "").trim());
  return (
    <div className="aops-pm-phases">
      <div className="aops-pm-phases-toolbar">
        <SegmentedControl
          compact={compact}
          ariaLabel={t("pmPhaseView")}
          value={phaseView}
          items={[
            { value: "timeline", label: t("pmPhaseTimeline") },
            { value: "accordion", label: t("pmPhaseAccordion") },
            { value: "table", label: t("pmPhaseTable") }
          ]}
          onChange={(value) => onPhaseView(value as SprintPhaseView)}
        />
        {onMicrotaskQuery ? (
          <label className={`aops-pm-cards-search aops-pm-boardcard-search${compact ? " is-compact" : ""}`}>
            <input
              type="search"
              value={microtaskQuery ?? ""}
              placeholder={t("pmSprintMicrotaskSearch")}
              aria-label={t("pmSprintMicrotaskSearch")}
              onChange={(event) => onMicrotaskQuery(event.target.value)}
              data-testid="aops-v2-sprints-card-mtsearch"
            />
            {searching ? (
              <button
                type="button"
                className="aops-pm-cards-search-clear"
                aria-label={t("pmSprintMicrotaskSearchClear")}
                title={t("pmSprintMicrotaskSearchClear")}
                onClick={() => onMicrotaskQuery("")}
              >
                ✕
              </button>
            ) : null}
          </label>
        ) : null}
        {onSetAllPhases ? (
          <div className="aops-pm-boardcard-viewrow-end">
            <button
              type="button"
              className={`aops-pm-cards-mini${compact ? " is-compact" : ""}`}
              onClick={() => onSetAllPhases(true)}
              data-testid="aops-v2-sprints-card-expandphases"
            >
              {t("pmCardsExpandAll")}
            </button>
            <button
              type="button"
              className={`aops-pm-cards-mini${compact ? " is-compact" : ""}`}
              onClick={() => onSetAllPhases(false)}
              data-testid="aops-v2-sprints-card-collapsephases"
            >
              {t("pmCardsCollapseAll")}
            </button>
          </div>
        ) : null}
      </div>
      {searching && phases.length === 0 ? (
        <EmptyLine t={t} />
      ) : phaseView === "timeline" ? (
        <SprintTimeline detail={detail} visiblePhases={phases} compact={compact} t={t} />
      ) : phaseView === "accordion" ? (
        <PhaseList phases={phases} openPhases={openPhases} t={t} onToggle={onTogglePhase} />
      ) : (
        <PhaseGroupedTable phases={phases} collapsed={openPhases} onToggle={onTogglePhase} t={t} />
      )}
    </div>
  );
}

// Phases as a collapsible grouped table (aops-desktop grammar) — phase = group,
// microtasks = rows (checklist item / status / notes).
function PhaseGroupedTable({
  phases,
  collapsed,
  onToggle,
  t
}: {
  phases: CockpitPmPhase[];
  collapsed: Record<string, boolean>;
  onToggle: (id: string) => void;
  t: TFn;
}): ReactNode {
  return (
    <div className="aops-pm-grouptable-wrap aops-pm-phase-grouptable">
      <div className="aops-pm-grouptable" role="table" aria-label={t("pmPhasesTab")}>
        <div className="aops-pm-grouptable-headrow" role="row">
          <span className="gt-task">{t("pmPhaseChecklistItem")}</span>
          <span className="gt-status">{t("pmFieldStatus")}</span>
          <span className="gt-last">{t("pmPhaseNotes")}</span>
        </div>
        {phases.map((phase) => {
          const rows = phase.microtasks ?? [];
          const isOpen = collapsed[phase.id] ?? true;
          return (
            <Fragment key={phase.id}>
              <button
                type="button"
                className="aops-pm-grouptable-group"
                aria-expanded={isOpen}
                onClick={() => onToggle(phase.id)}
              >
                <svg
                  className={`aops-pm-grouptable-caret${isOpen ? " is-open" : ""}`}
                  viewBox="0 0 16 16"
                  width="12"
                  height="12"
                  fill="none"
                  aria-hidden="true"
                >
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="aops-pm-grouptable-group-name">{phase.name}</span>
                <span className="aops-pm-grouptable-group-count">{rows.length}</span>
              </button>
              {isOpen
                ? rows.map((mt) => {
                    const status = (mt.status ?? "").trim();
                    return (
                      <div className="aops-pm-grouptable-row aops-pm-phase-row" role="row" key={mt.id}>
                        <span className="gt-task">
                          <span className="gt-task-title">{mt.title}</span>
                        </span>
                        <span className="gt-status">
                          {status ? <Badge tone={toneForStatus(status)}>{status}</Badge> : <span className="aops-pm-muted">—</span>}
                        </span>
                        <span className="gt-last">{mt.notes || "—"}</span>
                      </div>
                    );
                  })
                : null}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function TasksTab({
  linkedTaskTitle,
  tasks,
  t
}: {
  linkedTaskTitle: string | null;
  tasks: SprintTaskRow[];
  t: TFn;
}): ReactNode {
  if (!linkedTaskTitle && tasks.length === 0) return <EmptyLine t={t} />;
  return (
    <ul className="aops-pm-sprint-tasks">
      {linkedTaskTitle ? (
        <li className="aops-pm-sprint-task is-linked">
          <span className="aops-pm-sprint-task-title">{linkedTaskTitle}</span>
          <Badge tone="indigo">{t("pmFieldLinkedTask")}</Badge>
        </li>
      ) : null}
      {tasks.map((task) => {
        const status = (task.status ?? "").trim();
        return (
          <li className="aops-pm-sprint-task" key={task.id}>
            <span className="aops-pm-sprint-task-title">{task.title}</span>
            {status ? <Badge tone={toneForStatus(status)}>{status}</Badge> : null}
          </li>
        );
      })}
    </ul>
  );
}
