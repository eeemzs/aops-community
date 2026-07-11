import { useMemo } from "react";
import {
  isArchivedPmRecord,
  shortId,
  useBoardTasks,
  type CockpitPmBoard,
  type PmBoardColumnView,
  type ProjectmanDataModel
} from "../../../lib/projectman";
import { apiErrorMessage } from "../../../lib/aopsApi";
import { Badge, Metric } from "../components";
import { formatPmDate } from "../helpers";
import { columnDotColor, isTaskCompleted } from "../boardKanban";
import type { AopsCockpitLocale } from "../../../lib/i18n";
import type { TFn } from "../types";
import { CloseIcon } from "./icons";

// Sticky right detail pane (ui-systemv2 §11.2): fixed height, inner scroll.
export function BoardDetailPane({
  board,
  columns,
  model,
  onClose,
  locale,
  t
}: {
  board: CockpitPmBoard;
  columns: PmBoardColumnView[];
  model: ProjectmanDataModel;
  onClose: () => void;
  locale: AopsCockpitLocale;
  t: TFn;
}) {
  // The pane always loads its board's tasks (lazy + cached, cards-mode data).
  const tasksQuery = useBoardTasks(model, board.id, true);
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const tasksLoaded = tasksQuery.data !== undefined;
  const columnById = useMemo(() => new Map(columns.map((column) => [column.id, column])), [columns]);
  const completedCount = tasks.filter((task) => isTaskCompleted(task, columnById)).length;
  const description = (board.description ?? "").trim();
  return (
    <aside className="aops-pm-cardpane" aria-label={t("pmCardPaneTitle")} data-testid="aops-v2-boards-cardpane">
      <header className="aops-pm-cardpane-head">
        <div className="aops-pm-cardpane-heading">
          <span className="aops-pm-board-eyebrow">{t("pmCardPaneTitle")}</span>
          <h3 className="aops-pm-cardpane-title">{board.name}</h3>
        </div>
        <button
          type="button"
          className="aops-pm-boardcard-action"
          aria-label={t("pmCardPaneClose")}
          title={t("pmCardPaneClose")}
          onClick={onClose}
          data-testid="aops-v2-boards-cardpane-close"
        >
          {CloseIcon}
        </button>
      </header>
      <div className="aops-pm-cardpane-body">
        <div className="aops-pm-cardpane-chips">
          {board.slug ? <span className="aops-pm-mono">{board.slug}</span> : null}
          <span className="aops-pm-mono">uid {shortId(board.id)}</span>
          {isArchivedPmRecord(board) ? <Badge tone="ghost">{t("navArchivedGroup")}</Badge> : null}
        </div>
        <p className={`aops-pm-cardpane-desc${description ? "" : " is-empty"}`}>
          {description || t("pmCardPaneNoDescription")}
        </p>
        {!tasksLoaded ? (
          <div className="aops-pm-boardcard-loading" role="status">
            {tasksQuery.isError ? apiErrorMessage(tasksQuery.error) : t("pmCardTasksLoading")}
          </div>
        ) : (
        <div className="aops-pm-board-summary" role="list" aria-label={t("pmBoardSummary")}>
          <Metric label={t("pmFieldColumn")} value={columns.length} />
          <Metric label={t("pmTasks")} value={tasks.length} />
          <Metric label={t("pmCompleted")} value={completedCount} />
          <Metric label={t("pmOpenItems")} value={tasks.length - completedCount} />
        </div>
        )}
        <section className="aops-pm-cardpane-section">
          <h4>{t("pmCardPaneColumns")}</h4>
          <div className="aops-pm-cardpane-columns">
            {columns.map((column) => {
              const count = tasks.filter((task) => task.boardColumnId === column.id).length;
              return (
                <div className="aops-pm-cardpane-column" key={column.id}>
                  <span className="aops-pm-kanban-dot" style={{ background: columnDotColor(column) }} aria-hidden />
                  <span className="aops-pm-cardpane-column-name">{column.name}</span>
                  <span className="aops-pm-cardpane-column-count">
                    {count}
                    {column.wipLimit ? `/${column.wipLimit}` : ""}
                  </span>
                </div>
              );
            })}
            {columns.length === 0 ? <p className="aops-pm-cardpane-desc is-empty">{t("pmNoRows")}</p> : null}
          </div>
        </section>
        <dl className="aops-pm-cardpane-dates">
          <div>
            <dt>{t("pmFieldCreated")}</dt>
            <dd>{formatPmDate(board.createdAt, locale)}</dd>
          </div>
          <div>
            <dt>{t("pmFieldUpdated")}</dt>
            <dd>{formatPmDate(board.updatedAt, locale)}</dd>
          </div>
        </dl>
      </div>
    </aside>
  );
}
