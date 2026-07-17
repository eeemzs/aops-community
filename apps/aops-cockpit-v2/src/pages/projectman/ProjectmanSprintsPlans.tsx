import { useMemo, useState, type ReactNode } from "react";
import { WorkbenchStatePanel } from "@aopslab/xf-ui-shell-react";
import { WorkbenchRecordDetailLayout } from "@aopslab/xf-ui-composition-react";
import { apiErrorMessage } from "../../lib/aopsApi";
import {
  shortId,
  toneForStatus,
  useProjectmanImplementationPlanDetail,
  useProjectmanSprintDetail,
  type CockpitPmTask
} from "../../lib/projectman";
import { Badge } from "./components";
import {
  SprintDetailBody,
  SprintRollupChips,
  type SprintPhaseView,
  type SprintTabId
} from "./sprintDetailBody";
import { ProjectmanSprintCards } from "./ProjectmanSprintCards";
import {
  buildSprintPlanItems,
  detailProgressLabel,
  issueSprintId,
  normalizePlanDetail
} from "./helpers";
import type { NormalizedPlanDetail, PlanRecordItem, ProjectmanSprintsProps, TFn } from "./types";

export function ProjectmanSprintsPlans({ model, navigator, selectedKey, locale, t }: ProjectmanSprintsProps) {
  // locale drives the cards register dates; sprint tables are count/status
  // based today (no dates) — S0.2 rollup keeps it that way.
  const [activeTab, setActiveTab] = useState<SprintTabId>("phases");
  const [openPhases, setOpenPhases] = useState<Record<string, boolean>>({});
  const [phaseView, setPhaseView] = useState<SprintPhaseView>("timeline");
  const taskById = useMemo(() => new Map(model.tasks.map((task) => [task.id, task])), [model.tasks]);
  const items = useMemo(
    () => buildSprintPlanItems(model.sprints, model.implementationPlans),
    [model.implementationPlans, model.sprints]
  );

  // Cards mode: no navigator chrome — the whole sprint/plan set renders as a
  // card register with its own toolbar + right detail pane (boards parity).
  if (navigator.isCardsMode) {
    return (
      <div className="aops-pm-board-view is-cards">
        <ProjectmanSprintCards
          model={model}
          navigator={navigator}
          selectedKey={selectedKey}
          items={items}
          locale={locale}
          t={t}
        />
      </div>
    );
  }
  return (
    <SprintsRecordDetail
      model={model}
      navigator={navigator}
      selectedKey={selectedKey}
      items={items}
      taskById={taskById}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      openPhases={openPhases}
      setOpenPhases={setOpenPhases}
      phaseView={phaseView}
      setPhaseView={setPhaseView}
      t={t}
    />
  );
}

function SprintsRecordDetail({
  model,
  navigator,
  selectedKey,
  items,
  taskById,
  activeTab,
  setActiveTab,
  openPhases,
  setOpenPhases,
  phaseView,
  setPhaseView,
  t
}: Pick<ProjectmanSprintsProps, "model" | "navigator" | "selectedKey"> & {
  items: PlanRecordItem[];
  taskById: Map<string, CockpitPmTask>;
  activeTab: SprintTabId;
  setActiveTab: (id: SprintTabId) => void;
  openPhases: Record<string, boolean>;
  setOpenPhases: (updater: (current: Record<string, boolean>) => Record<string, boolean>) => void;
  phaseView: SprintPhaseView;
  setPhaseView: (view: SprintPhaseView) => void;
  t: TFn;
}): ReactNode {
  const selected = items.find((item) => item.key === selectedKey) ?? items[0] ?? null;
  const sprintDetail = useProjectmanSprintDetail({
    model,
    sprintId: selected?.kind === "sprint" ? selected.id : null,
    enabled: selected?.kind === "sprint"
  });
  const planDetail = useProjectmanImplementationPlanDetail({
    model,
    planId: selected?.kind === "plan" ? selected.id : null,
    enabled: selected?.kind === "plan"
  });
  const selectedDetail = selected
    ? normalizePlanDetail(selected, selected.kind === "sprint" ? sprintDetail.data : planDetail.data)
    : null;
  const detailLoading =
    selected?.kind === "sprint" ? sprintDetail.isPending : selected?.kind === "plan" ? planDetail.isPending : false;
  const detailError = selected?.kind === "sprint" ? sprintDetail.error : selected?.kind === "plan" ? planDetail.error : null;
  const linkedTask = selectedDetail?.taskId ? taskById.get(selectedDetail.taskId) ?? null : null;
  const sprintTasks = selectedDetail
    ? model.tasks.filter((task) => task.sprintId === selectedDetail.id && task.id !== selectedDetail.taskId)
    : [];
  const linkedIssueCount = selectedDetail
    ? model.issues.filter((issue) => issueSprintId(issue) === selectedDetail.id).length
    : 0;

  const togglePhase = (id: string) => setOpenPhases((current) => ({ ...current, [id]: !(current[id] ?? true) }));

  const detail =
    selected && selectedDetail ? (
      <SprintDetail
        detail={selectedDetail}
        activeTab={activeTab}
        onTab={setActiveTab}
        phaseView={phaseView}
        onPhaseView={setPhaseView}
        openPhases={openPhases}
        onTogglePhase={togglePhase}
        loading={detailLoading}
        error={detailError ? apiErrorMessage(detailError, "detail_unavailable") : null}
        linkedTaskTitle={linkedTask?.title ?? null}
        sprintTasks={sprintTasks.map((task) => ({ id: task.id, title: task.title, status: task.status ?? null }))}
        linkedIssueCount={linkedIssueCount}
        t={t}
      />
    ) : (
      <WorkbenchStatePanel variant="empty" title={t("pmSprintsPlansTitle")} message={t("pmNoRows")} />
    );

  if (navigator.isDropdownMode) {
    return (
      <div className="aops-pm-board-view is-dropdown">
        <div className="aops-pm-board-navrow">{navigator.dropdownNode}</div>
        {detail}
      </div>
    );
  }
  return (
    <div className="aops-pm-board-view">
      <WorkbenchRecordDetailLayout
        controller={navigator.controller}
        navigator={navigator.treePanel}
        navigatorLabel={t("pmSprintsPlansTitle")}
        className="aops-pm-board-recordlayout"
        contentClassName="aops-pm-board-recordcontent"
        content={detail}
      />
    </div>
  );
}

function SprintDetail({
  detail,
  activeTab,
  onTab,
  phaseView,
  onPhaseView,
  openPhases,
  onTogglePhase,
  loading,
  error,
  linkedTaskTitle,
  sprintTasks,
  linkedIssueCount,
  t
}: {
  detail: NormalizedPlanDetail;
  activeTab: SprintTabId;
  onTab: (id: SprintTabId) => void;
  phaseView: SprintPhaseView;
  onPhaseView: (view: SprintPhaseView) => void;
  openPhases: Record<string, boolean>;
  onTogglePhase: (id: string) => void;
  loading: boolean;
  error: string | null;
  linkedTaskTitle: string | null;
  sprintTasks: Array<{ id: string; title: string; status: string | null }>;
  linkedIssueCount: number;
  t: TFn;
}): ReactNode {
  return (
    <section className="aops-pm-sprint-record" aria-label={detail.name}>
      <header className="aops-pm-rechead">
        <div className="aops-pm-rechead-id">
          <span className="aops-pm-rechead-eyebrow">
            {detail.kind === "sprint" ? t("pmSprintType") : t("pmPlanType")}
          </span>
          <h3 className="aops-pm-rechead-title">{detail.name}</h3>
          <div className="aops-pm-rechead-meta">
            <Badge tone={toneForStatus(detail.status)}>{detail.status ?? t("pmUnknownStatus")}</Badge>
            <span className="aops-pm-muted">{detailProgressLabel(detail)}</span>
            <span className="aops-pm-muted">
              {t("pmIssues")}: {linkedIssueCount}
            </span>
            <span className="aops-pm-mono">{shortId(detail.id)}</span>
            {loading ? <Badge tone="amber">{t("pmLoadingDetail")}</Badge> : null}
          </div>
          {detail.goal ? <p className="aops-pm-sprint-goal">{detail.goal}</p> : null}
          <SprintRollupChips detail={detail} t={t} />
        </div>
      </header>
      {error ? <p className="aops-pm-error-line">{error}</p> : null}
      <SprintDetailBody
        detail={detail}
        activeTab={activeTab}
        onTab={onTab}
        phaseView={phaseView}
        onPhaseView={onPhaseView}
        openPhases={openPhases}
        onTogglePhase={onTogglePhase}
        linkedTaskTitle={linkedTaskTitle}
        sprintTasks={sprintTasks}
        t={t}
      />
    </section>
  );
}
