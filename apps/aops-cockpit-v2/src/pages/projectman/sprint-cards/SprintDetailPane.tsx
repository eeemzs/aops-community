import { useMemo } from "react";
import {
  shortId,
  toneForStatus,
  useProjectmanImplementationPlanDetail,
  useProjectmanSprintDetail,
  type ProjectmanDataModel
} from "../../../lib/projectman";
import { apiErrorMessage } from "../../../lib/aopsApi";
import { Badge, Metric } from "../components";
import { detailProgressLabel, formatPmDate, normalizePlanDetail } from "../helpers";
import { SprintRollupChips } from "../sprintDetailBody";
import type { AopsCockpitLocale } from "../../../lib/i18n";
import type { PlanRecordItem, TFn } from "../types";
import { CloseIcon } from "../board-cards/icons";
import { progressPercent } from "./SprintRegisterCard";

// Sticky right detail pane (ui-systemv2 §11.2) — the aops-desktop sprint
// snapshot grammar: status/progress/goal/linked task/dates + rollup chips +
// section counts. Fixed height, inner scroll.
export function SprintDetailPane({
  item,
  model,
  onClose,
  locale,
  t
}: {
  item: PlanRecordItem;
  model: ProjectmanDataModel;
  onClose: () => void;
  locale: AopsCockpitLocale;
  t: TFn;
}) {
  const sprintDetail = useProjectmanSprintDetail({
    model,
    sprintId: item.kind === "sprint" ? item.id : null,
    enabled: item.kind === "sprint"
  });
  const planDetail = useProjectmanImplementationPlanDetail({
    model,
    planId: item.kind === "plan" ? item.id : null,
    enabled: item.kind === "plan"
  });
  const rawDetail = item.kind === "sprint" ? sprintDetail.data : planDetail.data;
  const detailError = item.kind === "sprint" ? sprintDetail.error : planDetail.error;
  const detailLoaded = rawDetail !== undefined;
  const detail = useMemo(() => normalizePlanDetail(item, rawDetail), [item, rawDetail]);
  const percent = detailLoaded ? progressPercent(detail) : null;
  const linkedTask = item.taskId ? model.tasks.find((task) => task.id === item.taskId) ?? null : null;
  const status = (item.status ?? "").trim();
  const goal = (detail.goal ?? "").trim();
  const microtaskCount = detail.phases.reduce((count, phase) => count + (phase.microtasks?.length ?? 0), 0);

  return (
    <aside className="aops-pm-cardpane" aria-label={t("pmSprintPaneTitle")} data-testid="aops-v2-sprints-cardpane">
      <header className="aops-pm-cardpane-head">
        <div className="aops-pm-cardpane-heading">
          <span className="aops-pm-board-eyebrow">
            {item.kind === "sprint" ? t("pmSprintType") : t("pmPlanType")}
          </span>
          <h3 className="aops-pm-cardpane-title">{item.name}</h3>
        </div>
        <button
          type="button"
          className="aops-pm-boardcard-action"
          aria-label={t("pmCardPaneClose")}
          title={t("pmCardPaneClose")}
          onClick={onClose}
          data-testid="aops-v2-sprints-cardpane-close"
        >
          {CloseIcon}
        </button>
      </header>
      <div className="aops-pm-cardpane-body">
        <div className="aops-pm-cardpane-chips">
          <Badge tone={toneForStatus(status || null)}>{status || t("pmUnknownStatus")}</Badge>
          {item.archived ? <Badge tone="ghost">{t("navArchivedGroup")}</Badge> : null}
          <span className="aops-pm-mono">uid {shortId(item.id)}</span>
        </div>
        {!detailLoaded ? (
          <div className="aops-pm-boardcard-loading" role="status">
            {detailError ? apiErrorMessage(detailError) : t("pmLoadingDetail")}
          </div>
        ) : (
          <>
            {percent !== null ? (
              <div className="aops-pm-sprintcard-progress is-pane" aria-label={`${t("pmFieldProgress")}: ${percent}%`}>
                <strong>{percent}%</strong>
                <span className="aops-pm-progress-track" aria-hidden>
                  <span
                    className={`aops-pm-progress-fill${percent >= 100 ? " is-done" : ""}`}
                    style={{ width: `${percent}%` }}
                  />
                </span>
                <span className="aops-pm-muted">{detailProgressLabel(detail)}</span>
              </div>
            ) : null}
            <SprintRollupChips detail={detail} t={t} />
            <p className={`aops-pm-cardpane-desc${goal ? "" : " is-empty"}`}>
              {goal || t("pmCardPaneNoDescription")}
            </p>
            <div className="aops-pm-board-summary" role="list" aria-label={t("pmSprintPaneTitle")}>
              <Metric label={t("pmPhasesTab")} value={detail.phases.length} />
              <Metric label={t("pmTasksTab")} value={microtaskCount} />
              <Metric label={t("pmScopeTitle")} value={detail.scope.length} />
              <Metric label={t("pmValidationTitle")} value={detail.validationPlan.length} />
            </div>
            {linkedTask ? (
              <section className="aops-pm-cardpane-section">
                <h4>{t("pmFieldLinkedTask")}</h4>
                <p className="aops-pm-cardpane-desc">{linkedTask.title}</p>
              </section>
            ) : null}
          </>
        )}
        <dl className="aops-pm-cardpane-dates">
          <div>
            <dt>{t("pmFieldCreated")}</dt>
            <dd>{formatPmDate(item.createdAt, locale)}</dd>
          </div>
          <div>
            <dt>{t("pmFieldUpdated")}</dt>
            <dd>{formatPmDate(item.updatedAt, locale)}</dd>
          </div>
        </dl>
      </div>
    </aside>
  );
}
