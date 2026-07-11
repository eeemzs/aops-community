import { Fragment, useEffect, useMemo, useState } from "react";
import {
  isDoneStatus,
  shortId,
  toneForStatus,
  type CockpitPmSprint,
  type CockpitPmTask,
  type PmBoardColumnView
} from "../../lib/projectman";
import { Badge, EmptyLine } from "./components";
import { formatPmDate, sprintLabel, taskProgressLabel } from "./helpers";
import type { AopsCockpitLocale } from "../../lib/i18n";
import type { TFn } from "./types";

// Shared board surfaces (kanban lanes + grouped table): used by the Boards
// page detail (left-menu / navigator / dropdown modes) and by the cards-mode
// register (each expanded board card hosts its OWN kanban/table view).

// Column accent dot (aops-cockpit DOT_BY_SLUG grammar): backlog→warm border,
// todo→amber, doing→coral, review→indigo, done→sage.
export const DONE_COLUMN_PATTERN = /done|complete|closed|shipped|accept/;
export function columnDotColor(column: PmBoardColumnView): string {
  const key = (column.slug || column.name || "").toLowerCase();
  if (DONE_COLUMN_PATTERN.test(key)) return "var(--sage)";
  if (/doing|progress|active|wip|working/.test(key)) return "var(--coral)";
  if (/review|test|qa|verify/.test(key)) return "var(--indigo)";
  if (/backlog|icebox|later/.test(key)) return "var(--border-warm-strong, var(--aops-v2-muted))";
  if (/todo|new|open|ready|next/.test(key)) return "var(--amber)";
  return "var(--aops-v2-muted)";
}

// A task counts as completed when its own status says so OR it sits in a
// done-family column (statuses are often unset; the lane is the real signal).
export function isTaskCompleted(task: CockpitPmTask, columnById: Map<string, PmBoardColumnView>): boolean {
  if (isDoneStatus(task.status)) return true;
  const column = task.boardColumnId ? columnById.get(task.boardColumnId) : undefined;
  return column ? DONE_COLUMN_PATTERN.test((column.slug || column.name || "").toLowerCase()) : false;
}

export function BoardKanban({
  boardName,
  columns,
  tasksByColumn,
  sprintById,
  onOpenTask,
  t
}: {
  boardName: string;
  columns: PmBoardColumnView[];
  tasksByColumn: Map<string, CockpitPmTask[]>;
  sprintById: Map<string, CockpitPmSprint>;
  onOpenTask?: (task: CockpitPmTask, trigger: HTMLButtonElement) => void;
  t: TFn;
}) {
  const unassignedTasks = tasksByColumn.get("unassigned") ?? [];
  const lanes = useMemo(
    () => [
      ...columns.map((column) => ({
        id: column.id,
        label: column.name,
        count: (tasksByColumn.get(column.id) ?? []).length,
        color: columnDotColor(column)
      })),
      ...(unassignedTasks.length
        ? [
            {
              id: "unassigned",
              label: t("pmUnassigned"),
              count: unassignedTasks.length,
              color: "var(--aops-v2-muted)"
            }
          ]
        : [])
    ],
    [columns, tasksByColumn, t, unassignedTasks.length]
  );
  const [selectedLaneId, setSelectedLaneId] = useState(() => lanes[0]?.id ?? "");

  useEffect(() => {
    if (!lanes.some((lane) => lane.id === selectedLaneId)) {
      setSelectedLaneId(lanes[0]?.id ?? "");
    }
  }, [lanes, selectedLaneId]);

  return (
    <div className="aops-pm-kanban-shell">
      <div className="aops-pm-mobile-lanes" role="tablist" aria-label={boardName}>
        {lanes.map((lane) => (
          <button
            key={lane.id}
            type="button"
            role="tab"
            aria-selected={selectedLaneId === lane.id}
            className={`aops-pm-mobile-lane${selectedLaneId === lane.id ? " is-active" : ""}`}
            onClick={() => setSelectedLaneId(lane.id)}
          >
            <span className="aops-pm-kanban-dot" style={{ background: lane.color }} aria-hidden />
            <span>{lane.label}</span>
            <b>{lane.count}</b>
          </button>
        ))}
      </div>
      <div className="aops-pm-kanban" aria-label={boardName}>
      {columns.map((column) => {
        const rows = tasksByColumn.get(column.id) ?? [];
        const over = Boolean(column.wipLimit && rows.length > column.wipLimit);
        return (
          <section
            className="aops-pm-kanban-lane"
            key={column.id}
            data-lane-selected={selectedLaneId === column.id ? "true" : "false"}
          >
            <header className="aops-pm-kanban-head">
              <span className="aops-pm-kanban-dot" style={{ background: columnDotColor(column) }} aria-hidden />
              <span className="aops-pm-kanban-name">{column.name}</span>
              <span className={`aops-pm-kanban-wip${over ? " is-over" : ""}`}>
                {rows.length}
                {column.wipLimit ? `/${column.wipLimit}` : ""}
              </span>
            </header>
            <div className="aops-pm-kanban-cards">
              {rows.map((task) => (
                <BoardTaskCard
                  key={task.id}
                  task={task}
                  sprintName={sprintLabel(task, sprintById, t)}
                  onOpen={onOpenTask ? (trigger) => onOpenTask(task, trigger) : undefined}
                />
              ))}
              {rows.length === 0 ? <EmptyLine t={t} /> : null}
            </div>
          </section>
        );
      })}
      {unassignedTasks.length ? (
        <section
          className="aops-pm-kanban-lane"
          data-lane-selected={selectedLaneId === "unassigned" ? "true" : "false"}
        >
          <header className="aops-pm-kanban-head">
            <span className="aops-pm-kanban-dot" style={{ background: "var(--aops-v2-muted)" }} aria-hidden />
            <span className="aops-pm-kanban-name">{t("pmUnassigned")}</span>
            <span className="aops-pm-kanban-wip">{unassignedTasks.length}</span>
          </header>
          <div className="aops-pm-kanban-cards">
            {unassignedTasks.map((task) => (
              <BoardTaskCard
                key={task.id}
                task={task}
                sprintName={sprintLabel(task, sprintById, t)}
                onOpen={onOpenTask ? (trigger) => onOpenTask(task, trigger) : undefined}
              />
            ))}
          </div>
        </section>
      ) : null}
      </div>
    </div>
  );
}

function BoardTaskCard({
  task,
  sprintName,
  onOpen
}: {
  task: CockpitPmTask;
  sprintName: string;
  onOpen?: (trigger: HTMLButtonElement) => void;
}) {
  // The lane already conveys status; only surface an explicit status chip when
  // it's meaningful (set and not "unknown"), so cards stay clean (aops-cockpit).
  const rawStatus = (task.status ?? "").trim();
  const showStatus = rawStatus.length > 0 && !/unknown|none/i.test(rawStatus);
  const hasProgress = typeof task.progress === "number";
  return (
    <article className={`aops-pm-kanban-card${onOpen ? " is-actionable" : ""}`}>
      <div className="aops-pm-card-head">
        <span className="aops-pm-mono">{task.taskCode ?? shortId(task.id)}</span>
        {showStatus ? <Badge tone={toneForStatus(rawStatus)}>{rawStatus}</Badge> : null}
      </div>
      <h4>{task.title}</h4>
      <div className="aops-pm-task-meta">
        {hasProgress ? (
          <Badge tone={(task.progress ?? 0) >= 100 ? "sage" : "amber"}>{taskProgressLabel(task)}</Badge>
        ) : null}
        {sprintName ? <Badge tone="ghost">{sprintName}</Badge> : null}
      </div>
      {onOpen ? (
        <button
          type="button"
          className="aops-pm-task-open"
          onClick={(event) => onOpen(event.currentTarget)}
          aria-label={task.title}
        >
          <span aria-hidden>→</span>
        </button>
      ) : null}
    </article>
  );
}

export type BoardGroupBy = "none" | "column" | "sprint";

interface TableGroup {
  id: string;
  label: string;
  rows: CockpitPmTask[];
}

// aops-desktop grouped-table mechanic (buildKanbanTableSections): bucket tasks
// by the group dimension into ordered, collapsible sections. Column groups
// follow the board's column order (unassigned last); sprint groups follow task
// encounter order. "none" = one flat section (no header).
function buildTableGroups(
  tasks: CockpitPmTask[],
  groupBy: BoardGroupBy,
  columns: Map<string, PmBoardColumnView>,
  orderedColumns: PmBoardColumnView[],
  sprintById: Map<string, CockpitPmSprint>,
  t: TFn
): TableGroup[] {
  if (groupBy === "none") return [{ id: "__all", label: "", rows: tasks }];
  const order: string[] = [];
  const map = new Map<string, TableGroup>();
  const addGroup = (key: string, label: string): TableGroup => {
    let group = map.get(key);
    if (!group) {
      group = { id: key, label, rows: [] };
      map.set(key, group);
      order.push(key);
    }
    return group;
  };
  if (groupBy === "column") {
    for (const column of orderedColumns) addGroup(column.id, column.name);
  }
  for (const task of tasks) {
    let key: string;
    let label: string;
    if (groupBy === "column") {
      const hasCol = Boolean(task.boardColumnId && columns.has(task.boardColumnId));
      key = hasCol ? (task.boardColumnId as string) : "__unassigned";
      label = hasCol ? columns.get(key)?.name ?? t("pmUnassigned") : t("pmUnassigned");
    } else {
      key = task.sprintId ?? "__nosprint";
      label = task.sprintId ? sprintById.get(task.sprintId)?.name ?? shortId(task.sprintId) : t("pmNoSprint");
    }
    addGroup(key, label).rows.push(task);
  }
  return order.map((key) => map.get(key) as TableGroup).filter((group) => group.rows.length > 0);
}

// Progress bar cell (aops-desktop grouped-table grammar): compact track + %.
// Fill uses the chip tone family — sage at 100, amber while in flight.
function ProgressCell({ task }: { task: CockpitPmTask }) {
  if (typeof task.progress !== "number") return <span className="aops-pm-muted">—</span>;
  const clamped = Math.max(0, Math.min(100, task.progress));
  return (
    <span className="aops-pm-progress">
      <span className="aops-pm-progress-track" aria-hidden>
        <span
          className={`aops-pm-progress-fill${clamped >= 100 ? " is-done" : ""}`}
          style={{ width: `${clamped}%` }}
        />
      </span>
      <span className="aops-pm-progress-label">{taskProgressLabel(task)}</span>
    </span>
  );
}

export function GroupedBoardTable({
  tasks,
  groupBy,
  columns,
  orderedColumns,
  sprintById,
  collapsed,
  onToggleGroup,
  locale,
  t
}: {
  tasks: CockpitPmTask[];
  groupBy: BoardGroupBy;
  columns: Map<string, PmBoardColumnView>;
  orderedColumns: PmBoardColumnView[];
  sprintById: Map<string, CockpitPmSprint>;
  collapsed: Set<string>;
  onToggleGroup: (id: string) => void;
  locale: AopsCockpitLocale;
  t: TFn;
}) {
  if (tasks.length === 0) {
    return (
      <div className="aops-pm-grouptable-wrap">
        <EmptyLine t={t} />
      </div>
    );
  }
  const groups = buildTableGroups(tasks, groupBy, columns, orderedColumns, sprintById, t);
  // Column-grouped rows show Sprint; sprint-grouped and flat rows show Column
  // (aops-desktop FLAT_TABLE_COLUMNS adds the Column cell in flat mode).
  const lastColLabel = groupBy === "column" ? t("pmFieldSprint") : t("pmFieldColumn");
  const lastColValue = (task: CockpitPmTask): string =>
    groupBy === "column"
      ? sprintLabel(task, sprintById, t)
      : task.boardColumnId
        ? columns.get(task.boardColumnId)?.name ?? t("pmUnassigned")
        : t("pmUnassigned");

  return (
    <div className="aops-pm-grouptable-wrap">
      <div className="aops-pm-grouptable" role="table" aria-label={t("pmTasks")}>
        <div className="aops-pm-grouptable-headrow" role="row">
          <span className="gt-task">{t("pmTasks")}</span>
          <span className="gt-progress">{t("pmFieldProgress")}</span>
          <span className="gt-updated">{t("pmFieldUpdated")}</span>
          <span className="gt-last">{lastColLabel}</span>
        </div>
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.id);
          return (
            <Fragment key={group.id}>
              {group.label !== "" ? (
                <button
                  type="button"
                  className="aops-pm-grouptable-group"
                  aria-expanded={!isCollapsed}
                  onClick={() => onToggleGroup(group.id)}
                >
                  <svg
                    className={`aops-pm-grouptable-caret${isCollapsed ? "" : " is-open"}`}
                    viewBox="0 0 16 16"
                    width="12"
                    height="12"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="aops-pm-grouptable-group-name">{group.label}</span>
                  <span className="aops-pm-grouptable-group-count">{group.rows.length}</span>
                </button>
              ) : null}
              {!isCollapsed
                ? group.rows.map((task) => (
                    <div className="aops-pm-grouptable-row" role="row" key={task.id}>
                      <span className="gt-task">
                        <span className="aops-pm-mono">{task.taskCode ?? shortId(task.id)}</span>
                        <span className="gt-task-title">{task.title}</span>
                      </span>
                      <span className="gt-progress">
                        <ProgressCell task={task} />
                      </span>
                      <span className="gt-updated">{formatPmDate(task.updatedAt, locale)}</span>
                      <span className="gt-last">{lastColValue(task)}</span>
                    </div>
                  ))
                : null}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
