import { useMemo, useState } from "react";
import {
  shortId,
  toneForStatus,
  useProjectmanImplementationPlanDetail,
  useProjectmanSprintDetail,
  type ProjectmanDataModel
} from "../../../lib/projectman";
import { apiErrorMessage } from "../../../lib/aopsApi";
import { Badge } from "../components";
import { formatPmDate, normalizePlanDetail } from "../helpers";
import { SprintDetailBody, SprintRollupChips } from "../sprintDetailBody";
import type { AopsCockpitLocale } from "../../../lib/i18n";
import type { NormalizedPlanDetail, PlanRecordItem, TFn } from "../types";
import type { SprintBodyView } from "./shared";
import {
  ArchiveIcon,
  BoardToggleIcon,
  DownIcon,
  EditIcon,
  FavoriteStarIcon,
  KebabIcon,
  SparkIcon,
  TrashIcon,
  UpIcon,
  usePopover
} from "../board-cards/icons";

// Desktop toProgress grammar: prefer the stored progress ratio, fall back to
// completed/total, clamp to 0..100.
export function progressPercent(detail: NormalizedPlanDetail): number | null {
  const progress = detail.progress;
  const total =
    typeof progress?.total === "number" && progress.total >= 0
      ? progress.total
      : detail.phases.reduce((count, phase) => count + (phase.microtasks?.length ?? 0), 0);
  const completed = typeof progress?.completed === "number" ? progress.completed : null;
  const ratio =
    typeof progress?.ratio === "number" && progress.ratio >= 0
      ? progress.ratio
      : completed !== null && total > 0
        ? completed / total
        : null;
  if (ratio === null) return null;
  return Math.round(Math.max(0, Math.min(1, ratio)) * 100);
}

// Kebab (sprints only — implementation plans have no lifecycle ops in the kit
// catalog): archive/unarchive (immediate) + delete (confirm modal in parent).
function SprintCardKebab({
  archived,
  busy,
  onToggleArchive,
  onRequestDelete,
  t
}: {
  archived: boolean;
  busy: boolean;
  onToggleArchive: () => void;
  onRequestDelete: () => void;
  t: TFn;
}) {
  const { open, setOpen, rootRef } = usePopover();
  return (
    <div className="aops-pm-boardcard-menuwrap" ref={rootRef}>
      <button
        type="button"
        className={`aops-pm-boardcard-action${open ? " is-active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("pmCardMenu")}
        title={t("pmCardMenu")}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        data-testid="aops-v2-sprints-card-menu"
      >
        {KebabIcon}
      </button>
      {open ? (
        <div className="aops-pm-cards-popmenu is-right" role="menu">
          <button
            type="button"
            role="menuitem"
            className="aops-pm-cards-popmenu-option"
            onClick={() => {
              setOpen(false);
              onToggleArchive();
            }}
            data-testid="aops-v2-sprints-card-archive"
          >
            <span className="aops-pm-cards-popmenu-option-icon">{ArchiveIcon}</span>
            <span className="aops-pm-cards-popmenu-option-copy">
              <b>{archived ? t("pmSprintUnarchive") : t("pmSprintArchive")}</b>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="aops-pm-cards-popmenu-option is-danger"
            onClick={() => {
              setOpen(false);
              onRequestDelete();
            }}
            data-testid="aops-v2-sprints-card-delete"
          >
            <span className="aops-pm-cards-popmenu-option-icon">{TrashIcon}</span>
            <span className="aops-pm-cards-popmenu-option-copy">
              <b>{t("pmSprintDelete")}</b>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

// One sprint/plan register card (aops-desktop pm-sprint-v2-card grammar on the
// shared boardcard chassis): head = toggle + name + uid + kind/status badges +
// progress bar, subtitle = linked task • goal, Created/Updated stats; right =
// icon actions + status rollup chips; expanded body = the tabbed detail with a
// per-card checklist toolbar. Detail loads lazily on expand/pane-open.
export function SprintRegisterCard({
  item,
  model,
  isFavorite,
  isExpanded,
  isSelected,
  canMoveUp,
  canMoveDown,
  menuBusy,
  bodyView,
  onSetBodyView,
  onToggleExpanded,
  onToggleFavorite,
  onMoveUp,
  onMoveDown,
  onOpenDetail,
  onToggleArchive,
  onRequestDelete,
  locale,
  t
}: {
  item: PlanRecordItem;
  model: ProjectmanDataModel;
  isFavorite: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  menuBusy: boolean;
  bodyView: SprintBodyView;
  onSetBodyView: (patch: Partial<SprintBodyView>) => void;
  onToggleExpanded: () => void;
  onToggleFavorite: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onOpenDetail: () => void;
  onToggleArchive: () => void;
  onRequestDelete: () => void;
  locale: AopsCockpitLocale;
  t: TFn;
}) {
  const active = isExpanded || isSelected;
  const sprintDetail = useProjectmanSprintDetail({
    model,
    sprintId: item.kind === "sprint" ? item.id : null,
    enabled: active && item.kind === "sprint"
  });
  const planDetail = useProjectmanImplementationPlanDetail({
    model,
    planId: item.kind === "plan" ? item.id : null,
    enabled: active && item.kind === "plan"
  });
  const rawDetail = item.kind === "sprint" ? sprintDetail.data : planDetail.data;
  const detailError = item.kind === "sprint" ? sprintDetail.error : planDetail.error;
  const detailLoaded = rawDetail !== undefined;
  const detail = useMemo(() => normalizePlanDetail(item, rawDetail), [item, rawDetail]);
  const percent = detailLoaded ? progressPercent(detail) : null;

  const linkedTask = item.taskId ? model.tasks.find((task) => task.id === item.taskId) ?? null : null;
  const sprintTasks = useMemo(
    () =>
      model.tasks
        .filter((task) => task.sprintId === item.id && task.id !== item.taskId)
        .map((task) => ({ id: task.id, title: task.title, status: task.status ?? null })),
    [item.id, item.taskId, model.tasks]
  );

  // Per-card session-local body state (persisted parts flow via bodyView).
  const [openPhases, setOpenPhases] = useState<Record<string, boolean>>({});
  const [microtaskQuery, setMicrotaskQuery] = useState("");
  const togglePhase = (id: string) =>
    setOpenPhases((current) => ({ ...current, [id]: !(current[id] ?? true) }));
  const setAllPhases = (open: boolean) =>
    setOpenPhases(Object.fromEntries(detail.phases.map((phase) => [phase.id, open])));

  const status = (item.status ?? "").trim();
  const subtitle = [linkedTask?.title, item.goal?.trim()].filter(Boolean).join(" • ");

  const copyId = () => {
    try {
      void navigator.clipboard?.writeText(item.id);
    } catch {
      /* ignore */
    }
  };

  return (
    <section
      className={`aops-pm-boardcard aops-pm-sprintcard${isSelected ? " is-selected" : ""}`}
      data-testid="aops-v2-sprints-card"
      data-record-key={item.key}
    >
      <div className="aops-pm-boardcard-head">
        <div className="aops-pm-boardcard-copy">
          <div className="aops-pm-boardcard-titlerow">
            <button
              type="button"
              className="aops-pm-boardcard-toggle"
              aria-expanded={isExpanded}
              aria-label={isExpanded ? t("pmCardCollapse") : t("pmCardExpand")}
              onClick={onToggleExpanded}
            >
              <span className="aops-pm-boardcard-symbol" aria-hidden>
                <BoardToggleIcon expanded={isExpanded} />
              </span>
              <span className="aops-pm-boardcard-title">{item.name}</span>
            </button>
            <Badge tone="ghost">{item.kind === "sprint" ? t("pmSprintType") : t("pmPlanType")}</Badge>
            <Badge tone={toneForStatus(status || null)}>{status || t("pmUnknownStatus")}</Badge>
            {item.archived ? <Badge tone="ghost">{t("navArchivedGroup")}</Badge> : null}
            {percent !== null ? (
              <span
                className="aops-pm-sprintcard-progress"
                aria-label={`${t("pmFieldProgress")}: ${percent}%`}
              >
                <strong>{percent}%</strong>
                <span className="aops-pm-progress-track" aria-hidden>
                  <span
                    className={`aops-pm-progress-fill${percent >= 100 ? " is-done" : ""}`}
                    style={{ width: `${percent}%` }}
                  />
                </span>
              </span>
            ) : null}
          </div>
          {subtitle ? (
            <p
              className="aops-pm-boardcard-desc"
              role="button"
              tabIndex={0}
              aria-expanded={isExpanded}
              onClick={onToggleExpanded}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onToggleExpanded();
                }
              }}
            >
              {subtitle}
            </p>
          ) : null}
          <div className="aops-pm-boardcard-meta">
            <span>
              {t("pmFieldCreated")}: {formatPmDate(item.createdAt, locale)}
            </span>
            <span>
              {t("pmFieldUpdated")}: {formatPmDate(item.updatedAt, locale)}
            </span>
            <button
              type="button"
              className="aops-pm-boardcard-uid"
              title={t("pmCardCopyId")}
              aria-label={t("pmCardCopyId")}
              onClick={copyId}
            >
              uid {shortId(item.id)}
            </button>
          </div>
        </div>
        <div className="aops-pm-boardcard-side">
          <div className="aops-pm-boardcard-actions">
            <button
              type="button"
              className="aops-pm-boardcard-action"
              aria-label={`${t("pmCardDetail")}: ${item.name}`}
              title={t("pmCardDetail")}
              onClick={onOpenDetail}
              data-testid="aops-v2-sprints-card-detail"
            >
              {SparkIcon}
            </button>
            <button
              type="button"
              className={`aops-pm-boardcard-action theme-accent${isFavorite ? " is-active" : ""}`}
              aria-label={isFavorite ? t("pmCardFavoriteRemove") : t("pmCardFavoriteAdd")}
              aria-pressed={isFavorite}
              title={isFavorite ? t("pmCardFavoriteRemove") : t("pmCardFavoriteAdd")}
              onClick={onToggleFavorite}
              data-testid="aops-v2-sprints-card-favorite"
            >
              <FavoriteStarIcon filled={isFavorite} />
            </button>
            <button
              type="button"
              className="aops-pm-boardcard-action theme-accent"
              aria-label={`${t("pmCardMoveUp")}: ${item.name}`}
              title={t("pmCardMoveUp")}
              onClick={onMoveUp}
              disabled={!canMoveUp}
              data-testid="aops-v2-sprints-card-moveup"
            >
              {UpIcon}
            </button>
            <button
              type="button"
              className="aops-pm-boardcard-action theme-accent"
              aria-label={`${t("pmCardMoveDown")}: ${item.name}`}
              title={t("pmCardMoveDown")}
              onClick={onMoveDown}
              disabled={!canMoveDown}
              data-testid="aops-v2-sprints-card-movedown"
            >
              {DownIcon}
            </button>
            <button
              type="button"
              className="aops-pm-boardcard-action"
              aria-label={`${t("pmCardEdit")}: ${item.name}`}
              title={`${t("pmCardEdit")} — ${t("pmCardReadOnly")}`}
              disabled
              data-testid="aops-v2-sprints-card-edit"
            >
              {EditIcon}
            </button>
            {item.kind === "sprint" ? (
              <SprintCardKebab
                archived={item.archived}
                busy={menuBusy}
                onToggleArchive={onToggleArchive}
                onRequestDelete={onRequestDelete}
                t={t}
              />
            ) : null}
          </div>
          {detailLoaded ? <SprintRollupChips detail={detail} t={t} /> : null}
        </div>
      </div>
      {isExpanded && !detailLoaded ? (
        <div className="aops-pm-boardcard-body">
          <div className="aops-pm-boardcard-loading" role="status">
            {detailError ? apiErrorMessage(detailError) : t("pmLoadingDetail")}
          </div>
        </div>
      ) : null}
      {isExpanded && detailLoaded ? (
        <div className="aops-pm-boardcard-body aops-pm-sprintcard-body">
          <SprintDetailBody
            detail={detail}
            activeTab={bodyView.tab}
            onTab={(tab) => onSetBodyView({ tab })}
            phaseView={bodyView.phaseView}
            onPhaseView={(phaseView) => onSetBodyView({ phaseView })}
            openPhases={openPhases}
            onTogglePhase={togglePhase}
            onSetAllPhases={setAllPhases}
            microtaskQuery={microtaskQuery}
            onMicrotaskQuery={setMicrotaskQuery}
            linkedTaskTitle={linkedTask?.title ?? null}
            sprintTasks={sprintTasks}
            compact
            t={t}
          />
        </div>
      ) : null}
    </section>
  );
}
