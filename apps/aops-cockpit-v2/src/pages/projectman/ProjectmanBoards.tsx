import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { WorkbenchStatePanel } from "@aopslab/xf-ui-shell-react";
import { WorkbenchRecordDetailLayout } from "@aopslab/xf-ui-composition-react";
import { type CockpitPmTask } from "../../lib/projectman";
import { Badge, DetailRow, Metric, SegmentedControl } from "./components";
import { sprintLabel, taskProgressLabel, useColumnMap } from "./helpers";
import { BoardKanban, GroupedBoardTable, isTaskCompleted, type BoardGroupBy } from "./boardKanban";
import { ProjectmanBoardCards } from "./ProjectmanBoardCards";
import type { BoardMode, ProjectmanBoardsProps } from "./types";

export function ProjectmanBoards({ model, navigator, selectedBoardId, locale, t }: ProjectmanBoardsProps) {
  const [mode, setMode] = useState<BoardMode>("kanban");
  const [groupBy, setGroupBy] = useState<BoardGroupBy>("column");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [selectedTask, setSelectedTask] = useState<CockpitPmTask | null>(null);
  const taskDialogTitleId = useId();
  const taskDialogBackRef = useRef<HTMLButtonElement>(null);
  const taskDialogTriggerRef = useRef<HTMLButtonElement | null>(null);
  const toggleGroup = (id: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const columnById = useColumnMap(model);
  const sprintById = useMemo(() => new Map(model.sprints.map((sprint) => [sprint.id, sprint])), [model.sprints]);
  const selectedBoard = model.boards.find((board) => board.id === selectedBoardId) ?? null;
  const selectedColumns = selectedBoard ? model.columnsByBoard[selectedBoard.id] ?? [] : [];
  const selectedTasks = useMemo(
    () =>
      selectedBoard
        ? model.tasks
            .filter((task) => task.boardId === selectedBoard.id)
            .slice()
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        : [],
    [model.tasks, selectedBoard]
  );
  const tasksByColumn = useMemo(() => {
    const grouped = new Map<string, CockpitPmTask[]>();
    for (const task of selectedTasks) {
      const key = task.boardColumnId && columnById.has(task.boardColumnId) ? task.boardColumnId : "unassigned";
      grouped.set(key, [...(grouped.get(key) ?? []), task]);
    }
    return grouped;
  }, [columnById, selectedTasks]);
  const completedCount = selectedTasks.filter((task) => isTaskCompleted(task, columnById)).length;

  const openSelectedTask = useCallback((task: CockpitPmTask, trigger: HTMLButtonElement) => {
    taskDialogTriggerRef.current = trigger;
    setSelectedTask(task);
  }, []);

  const closeSelectedTask = useCallback(() => {
    setSelectedTask(null);
    window.requestAnimationFrame(() => taskDialogTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    setSelectedTask(null);
    taskDialogTriggerRef.current = null;
  }, [selectedBoardId]);

  useEffect(() => {
    if (!selectedTask) return;
    const frame = window.requestAnimationFrame(() => taskDialogBackRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeSelectedTask();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeSelectedTask, selectedTask]);

  const detail = selectedBoard ? (
    <div className="aops-pm-board-detail">
      <div className="aops-pm-board-toolbar">
        <div className="aops-pm-board-toolbar-id">
          <span className="aops-pm-board-eyebrow">{t("pmBoardsTitle")}</span>
          <h3 className="aops-pm-board-title">{selectedBoard.name}</h3>
        </div>
        <SegmentedControl
          ariaLabel={t("pmBoardViewMode")}
          value={mode}
          items={[
            { value: "kanban", label: t("pmBoardModeKanban") },
            { value: "table", label: t("pmBoardModeTable") }
          ]}
          onChange={(value) => setMode(value as BoardMode)}
        />
        {mode === "table" ? (
          <label className="aops-pm-groupby">
            <span className="aops-pm-groupby-label">{t("pmGroupBy")}</span>
            <SegmentedControl
              ariaLabel={t("pmGroupBy")}
              value={groupBy}
              items={[
                { value: "column", label: t("pmGroupColumn") },
                { value: "sprint", label: t("pmGroupSprint") },
                { value: "none", label: t("pmGroupNone") }
              ]}
              onChange={(value) => setGroupBy(value as BoardGroupBy)}
            />
          </label>
        ) : null}
        <span className="aops-pm-count">
          {t("pmCountVisible")}: {selectedTasks.length}
        </span>
      </div>
      <div className="aops-pm-board-summary" role="list" aria-label={t("pmBoardSummary")}>
        <Metric label={t("pmFieldColumn")} value={selectedColumns.length} />
        <Metric label={t("pmTasks")} value={selectedTasks.length} />
        <Metric label={t("pmCompleted")} value={completedCount} />
        <Metric label={t("pmOpenItems")} value={selectedTasks.length - completedCount} />
      </div>
      {mode === "kanban" ? (
        <BoardKanban
          boardName={selectedBoard.name}
          columns={selectedColumns}
          tasksByColumn={tasksByColumn}
          sprintById={sprintById}
          onOpenTask={openSelectedTask}
          t={t}
        />
      ) : (
        <GroupedBoardTable
          tasks={selectedTasks}
          groupBy={groupBy}
          columns={columnById}
          orderedColumns={selectedColumns}
          sprintById={sprintById}
          collapsed={collapsedGroups}
          onToggleGroup={toggleGroup}
          locale={locale}
          t={t}
        />
      )}
      {selectedTask ? (
        <>
        <div
          className="aops-pm-task-drilldown-backdrop"
          aria-hidden="true"
          onClick={closeSelectedTask}
        />
        <section
          className="aops-pm-task-drilldown"
          role="dialog"
          aria-modal="true"
          aria-labelledby={taskDialogTitleId}
        >
          <header className="aops-pm-task-drilldown-head">
            <button
              ref={taskDialogBackRef}
              type="button"
              className="aops-pm-task-drilldown-back"
              onClick={closeSelectedTask}
              aria-label={t("pmTaskDrilldownBack")}
            >
              <span aria-hidden>←</span>
              <span>{t("pmTaskDrilldownBack")}</span>
            </button>
            <Badge tone={selectedTask.progress === 100 ? "sage" : "amber"}>
              {taskProgressLabel(selectedTask)}
            </Badge>
          </header>
          <span className="aops-pm-mono">{selectedTask.taskCode ?? selectedTask.id.slice(0, 8)}</span>
          <h3 id={taskDialogTitleId}>{selectedTask.title}</h3>
          <p className="aops-pm-description">
            {selectedTask.description || t("pmTaskNoDescription")}
          </p>
          <dl className="aops-pm-detail-grid">
            <DetailRow
              label={t("pmFieldColumn")}
              value={
                selectedTask.boardColumnId
                  ? columnById.get(selectedTask.boardColumnId)?.name ?? t("pmUnassigned")
                  : t("pmUnassigned")
              }
              t={t}
            />
            <DetailRow
              label={t("pmFieldSprint")}
              value={sprintLabel(selectedTask, sprintById, t)}
              t={t}
            />
            {selectedTask.status && !/unknown|none/i.test(selectedTask.status) ? (
              <DetailRow label={t("pmFieldStatus")} value={selectedTask.status} t={t} />
            ) : null}
            <DetailRow
              label={t("pmFieldProgress")}
              value={taskProgressLabel(selectedTask)}
              t={t}
            />
          </dl>
        </section>
        </>
      ) : null}
    </div>
  ) : (
    <WorkbenchStatePanel variant="empty" title={t("pmBoardsTitle")} message={t("pmNoRows")} />
  );

  // Cards mode: no navigator chrome — the whole board set renders as an
  // aops-desktop-style card register with its own toolbar + right detail pane.
  if (navigator.isCardsMode) {
    return (
      <div className="aops-pm-board-view is-cards">
        <ProjectmanBoardCards
          model={model}
          navigator={navigator}
          selectedBoardId={selectedBoardId}
          locale={locale}
          t={t}
        />
      </div>
    );
  }
  // Dropdown mode: a searchable board dropdown + mode gear at the content
  // top-left, detail full-width below. Left-menu / navigator modes both flow
  // through the shared record-detail layout (the tree is inline for left-menu,
  // or handed to the shell dock by App for navigator mode).
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
        navigatorLabel={t("pmBoardsTitle")}
        className="aops-pm-board-recordlayout"
        contentClassName="aops-pm-board-recordcontent"
        content={detail}
      />
    </div>
  );
}
