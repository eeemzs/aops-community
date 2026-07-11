import { useMemo, useState } from "react";
import {
  isArchivedPmRecord,
  shortId,
  useBoardTasks,
  type CockpitPmBoard,
  type CockpitPmSprint,
  type CockpitPmTask,
  type PmBoardColumnView,
  type ProjectmanDataModel
} from "../../../lib/projectman";
import { apiErrorMessage } from "../../../lib/aopsApi";
import { Badge, SegmentedControl } from "../components";
import { formatPmDate } from "../helpers";
import { BoardKanban, columnDotColor, GroupedBoardTable, type BoardGroupBy } from "../boardKanban";
import type { AopsCockpitLocale } from "../../../lib/i18n";
import type { TFn } from "../types";
import type { BoardBodyView } from "./shared";
import {
  ArchiveIcon,
  BoardToggleIcon,
  CloseIcon,
  DownIcon,
  EditIcon,
  FavoriteStarIcon,
  FunnelIcon,
  KebabIcon,
  SearchIcon,
  SparkIcon,
  TrashIcon,
  UpIcon,
  usePopover
} from "./icons";

// Per-board column filter (board toolbar): All columns / one column / Unassigned.
function BoardColumnFilter({
  columns,
  value,
  onChange,
  boardName,
  t
}: {
  columns: PmBoardColumnView[];
  value: string;
  onChange: (value: string) => void;
  boardName: string;
  t: TFn;
}) {
  const { open, setOpen, rootRef } = usePopover();
  const options = [
    { id: "all", label: t("pmCardFilterAllColumns"), dot: null as string | null },
    ...columns.map((column) => ({ id: column.id, label: column.name, dot: columnDotColor(column) })),
    { id: "unassigned", label: t("pmUnassigned"), dot: "var(--aops-v2-muted)" }
  ];
  const active = value !== "all";
  return (
    <div className="aops-pm-cards-popwrap" ref={rootRef}>
      <button
        type="button"
        className={`aops-pm-cards-tool-btn is-compact${active ? " is-active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t("pmCardFilterColumns")}: ${boardName}`}
        title={t("pmCardFilterColumns")}
        onClick={() => setOpen((v) => !v)}
        data-testid="aops-v2-boards-card-columnfilter"
      >
        {FunnelIcon}
        {active ? <span className="aops-pm-cards-tool-badge">1</span> : null}
      </button>
      {open ? (
        <div className="aops-pm-cards-popmenu" role="menu">
          <span className="aops-pm-cards-popmenu-label">{t("pmCardFilterColumns")}</span>
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={value === option.id}
              className={`aops-pm-cards-popmenu-option${value === option.id ? " is-active" : ""}`}
              onClick={() => {
                onChange(option.id);
                setOpen(false);
              }}
            >
              <span className="aops-pm-cards-popmenu-option-copy">
                <b>
                  {option.dot ? (
                    <span className="aops-pm-kanban-dot" style={{ background: option.dot }} aria-hidden />
                  ) : null}
                  {option.label}
                </b>
              </span>
              {value === option.id ? <span className="aops-pm-cards-popmenu-check">✓</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Card kebab: archive/unarchive (soft, reversible — immediate) + delete
// (danger, opens the desktop-parity confirm modal owned by the parent).
function BoardCardKebab({
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
        data-testid="aops-v2-boards-card-menu"
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
            data-testid="aops-v2-boards-card-archive"
          >
            <span className="aops-pm-cards-popmenu-option-icon">{ArchiveIcon}</span>
            <span className="aops-pm-cards-popmenu-option-copy">
              <b>{archived ? t("pmCardUnarchive") : t("pmCardArchive")}</b>
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
            data-testid="aops-v2-boards-card-delete"
          >
            <span className="aops-pm-cards-popmenu-option-icon">{TrashIcon}</span>
            <span className="aops-pm-cards-popmenu-option-copy">
              <b>{t("pmCardDelete")}</b>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

// One board register card (aops-desktop kanban-board-tree grammar): collapsible
// head (toggle + title + description + meta), top-right icon actions + per-
// column stat chips; expanded body renders the board's own kanban/table view.
export function BoardRegisterCard({
  board,
  columns,
  model,
  sprintById,
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
  board: CockpitPmBoard;
  columns: PmBoardColumnView[];
  model: ProjectmanDataModel;
  sprintById: Map<string, CockpitPmSprint>;
  isFavorite: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  menuBusy: boolean;
  bodyView: BoardBodyView;
  onSetBodyView: (patch: Partial<BoardBodyView>) => void;
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
  // Lazy board data: tasks fetch on first expand (or detail-pane open) and
  // stay cached — collapsed, never-opened boards cost no task request.
  const tasksQuery = useBoardTasks(model, board.id, isExpanded || isSelected);
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const tasksLoaded = tasksQuery.data !== undefined;
  // Per-board toolbar state — session-local, board-scoped (not persisted):
  // table group collapse, task search and column filter live per card.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const toggleTableGroup = (id: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [taskQuery, setTaskQuery] = useState("");
  const [columnFilter, setColumnFilter] = useState<string>("all");
  const columnById = useMemo(() => new Map(columns.map((column) => [column.id, column])), [columns]);
  const orderedTasks = useMemo(
    () => tasks.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [tasks]
  );
  // Board-scoped task filtering: search on title/code + single-column filter.
  const filteredTasks = useMemo(() => {
    const q = taskQuery.trim().toLowerCase();
    return orderedTasks.filter((task) => {
      if (columnFilter === "unassigned") {
        if (task.boardColumnId && columnById.has(task.boardColumnId)) return false;
      } else if (columnFilter !== "all" && task.boardColumnId !== columnFilter) {
        return false;
      }
      if (q && !`${task.title} ${task.taskCode ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [columnById, columnFilter, orderedTasks, taskQuery]);
  // Kanban honours the column filter by narrowing the lanes themselves.
  const visibleColumns = useMemo(() => {
    if (columnFilter === "all") return columns;
    if (columnFilter === "unassigned") return [];
    return columns.filter((column) => column.id === columnFilter);
  }, [columnFilter, columns]);
  // Table group ids for this board's expand-all / collapse-all.
  const tableGroupIds = useMemo(() => {
    if (bodyView.groupBy === "column") return [...columns.map((column) => column.id), "__unassigned"];
    if (bodyView.groupBy === "sprint") {
      return Array.from(new Set(filteredTasks.map((task) => task.sprintId ?? "__nosprint")));
    }
    return [];
  }, [bodyView.groupBy, columns, filteredTasks]);
  const tasksByColumn = useMemo(() => {
    const columnIds = new Set(columns.map((column) => column.id));
    const grouped = new Map<string, CockpitPmTask[]>();
    for (const task of filteredTasks) {
      const key = task.boardColumnId && columnIds.has(task.boardColumnId) ? task.boardColumnId : "unassigned";
      grouped.set(key, [...(grouped.get(key) ?? []), task]);
    }
    return grouped;
  }, [columns, filteredTasks]);
  // Head stat chips always reflect the FULL board (the toolbar search/filter
  // only narrows the expanded body).
  const stats = useMemo(() => {
    const columnIds = new Set(columns.map((column) => column.id));
    const counts = new Map<string, number>();
    for (const task of tasks) {
      const key = task.boardColumnId && columnIds.has(task.boardColumnId) ? task.boardColumnId : "unassigned";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const rows = columns.map((column) => ({
      id: column.id,
      title: column.name,
      count: counts.get(column.id) ?? 0
    }));
    const unassigned = counts.get("unassigned") ?? 0;
    if (unassigned > 0) rows.push({ id: "unassigned", title: t("pmUnassigned"), count: unassigned });
    return rows;
  }, [columns, t, tasks]);
  const archived = isArchivedPmRecord(board);
  const description = (board.description ?? "").trim();

  const copyBoardId = () => {
    try {
      void navigator.clipboard?.writeText(board.id);
    } catch {
      /* ignore */
    }
  };

  return (
    <section
      className={`aops-pm-boardcard${isSelected ? " is-selected" : ""}`}
      data-testid="aops-v2-boards-card"
      data-board-id={board.id}
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
              <span className="aops-pm-boardcard-title">{board.name}</span>
            </button>
            {archived ? <Badge tone="ghost">{t("navArchivedGroup")}</Badge> : null}
          </div>
          {description ? (
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
              {description}
            </p>
          ) : null}
          <div className="aops-pm-boardcard-meta">
            <span>
              {tasksLoaded ? `${tasks.length} ${t("pmCardTasksWord")} · ` : ""}
              {`${columns.length} ${t("pmCardColumnsWord")}`}
            </span>
            {board.slug && board.slug !== board.name ? <span>{board.slug}</span> : null}
            <button
              type="button"
              className="aops-pm-boardcard-uid"
              title={t("pmCardCopyId")}
              aria-label={t("pmCardCopyId")}
              onClick={copyBoardId}
            >
              uid {shortId(board.id)}
            </button>
          </div>
        </div>
        <div className="aops-pm-boardcard-side">
          <div className="aops-pm-boardcard-actions">
            <button
              type="button"
              className="aops-pm-boardcard-action"
              aria-label={`${t("pmCardDetail")}: ${board.name}`}
              title={t("pmCardDetail")}
              onClick={onOpenDetail}
              data-testid="aops-v2-boards-card-detail"
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
              data-testid="aops-v2-boards-card-favorite"
            >
              <FavoriteStarIcon filled={isFavorite} />
            </button>
            <button
              type="button"
              className="aops-pm-boardcard-action theme-accent"
              aria-label={`${t("pmCardMoveUp")}: ${board.name}`}
              title={t("pmCardMoveUp")}
              onClick={onMoveUp}
              disabled={!canMoveUp}
              data-testid="aops-v2-boards-card-moveup"
            >
              {UpIcon}
            </button>
            <button
              type="button"
              className="aops-pm-boardcard-action theme-accent"
              aria-label={`${t("pmCardMoveDown")}: ${board.name}`}
              title={t("pmCardMoveDown")}
              onClick={onMoveDown}
              disabled={!canMoveDown}
              data-testid="aops-v2-boards-card-movedown"
            >
              {DownIcon}
            </button>
            <button
              type="button"
              className="aops-pm-boardcard-action"
              aria-label={`${t("pmCardEdit")}: ${board.name}`}
              title={`${t("pmCardEdit")} — ${t("pmCardReadOnly")}`}
              disabled
              data-testid="aops-v2-boards-card-edit"
            >
              {EditIcon}
            </button>
            <BoardCardKebab
              archived={archived}
              busy={menuBusy}
              onToggleArchive={onToggleArchive}
              onRequestDelete={onRequestDelete}
              t={t}
            />
          </div>
          {tasksLoaded && stats.length > 0 ? (
            <div className="aops-pm-boardcard-stats" aria-label={`${t("pmCardStatsLabel")}: ${board.name}`}>
              {stats.map((stat) => (
                <span key={stat.id} className="aops-pm-boardcard-stat">
                  <span className="aops-pm-boardcard-stat-label">{stat.title}</span>
                  <span className="aops-pm-boardcard-stat-value">{stat.count}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {isExpanded && !tasksLoaded ? (
        <div className="aops-pm-boardcard-body">
          <div className="aops-pm-boardcard-loading" role="status">
            {tasksQuery.isError ? apiErrorMessage(tasksQuery.error) : t("pmCardTasksLoading")}
          </div>
        </div>
      ) : null}
      {isExpanded && tasksLoaded ? (
        <div className="aops-pm-boardcard-body">
          <div className="aops-pm-boardcard-viewrow" role="toolbar" aria-label={`${t("pmCardsToolbar")}: ${board.name}`}>
            <SegmentedControl
              compact
              ariaLabel={`${t("pmBoardViewMode")}: ${board.name}`}
              value={bodyView.mode}
              items={[
                { value: "kanban", label: t("pmBoardModeKanban") },
                { value: "table", label: t("pmBoardModeTable") }
              ]}
              onChange={(value) => onSetBodyView({ mode: value as BoardBodyView["mode"] })}
            />
            {bodyView.mode === "table" ? (
              <label className="aops-pm-groupby is-compact">
                <span className="aops-pm-groupby-label">{t("pmGroupBy")}</span>
                <SegmentedControl
                  compact
                  ariaLabel={`${t("pmGroupBy")}: ${board.name}`}
                  value={bodyView.groupBy}
                  items={[
                    { value: "column", label: t("pmGroupColumn") },
                    { value: "sprint", label: t("pmGroupSprint") },
                    { value: "none", label: t("pmGroupNone") }
                  ]}
                  onChange={(value) => onSetBodyView({ groupBy: value as BoardGroupBy })}
                />
              </label>
            ) : null}
            <BoardColumnFilter
              columns={columns}
              value={columnFilter}
              onChange={setColumnFilter}
              boardName={board.name}
              t={t}
            />
            <label className="aops-pm-cards-search is-compact aops-pm-boardcard-search">
              <span className="aops-pm-cards-search-icon" aria-hidden>
                {SearchIcon}
              </span>
              <input
                type="search"
                value={taskQuery}
                placeholder={t("pmCardBoardSearch")}
                aria-label={`${t("pmCardBoardSearch")}: ${board.name}`}
                onChange={(event) => setTaskQuery(event.target.value)}
                data-testid="aops-v2-boards-card-tasksearch"
              />
              {taskQuery ? (
                <button
                  type="button"
                  className="aops-pm-cards-search-clear"
                  aria-label={t("pmCardBoardSearchClear")}
                  title={t("pmCardBoardSearchClear")}
                  onClick={() => setTaskQuery("")}
                >
                  {CloseIcon}
                </button>
              ) : null}
            </label>
            <div className="aops-pm-boardcard-viewrow-end">
              {bodyView.mode === "table" && bodyView.groupBy !== "none" ? (
                <>
                  <button
                    type="button"
                    className="aops-pm-cards-mini is-compact"
                    onClick={() => setCollapsedGroups(new Set())}
                    data-testid="aops-v2-boards-card-expandgroups"
                  >
                    {t("pmCardsExpandAll")}
                  </button>
                  <button
                    type="button"
                    className="aops-pm-cards-mini is-compact"
                    onClick={() => setCollapsedGroups(new Set(tableGroupIds))}
                    data-testid="aops-v2-boards-card-collapsegroups"
                  >
                    {t("pmCardsCollapseAll")}
                  </button>
                </>
              ) : null}
              <span className="aops-pm-boardcard-count">
                {t("pmCountVisible")}: {filteredTasks.length}
              </span>
            </div>
          </div>
          {bodyView.mode === "kanban" ? (
            <BoardKanban
              boardName={board.name}
              columns={visibleColumns}
              tasksByColumn={tasksByColumn}
              sprintById={sprintById}
              t={t}
            />
          ) : (
            <GroupedBoardTable
              tasks={filteredTasks}
              groupBy={bodyView.groupBy}
              columns={columnById}
              orderedColumns={visibleColumns}
              sprintById={sprintById}
              collapsed={collapsedGroups}
              onToggleGroup={toggleTableGroup}
              locale={locale}
              t={t}
            />
          )}
        </div>
      ) : null}
      <span className="aops-pm-boardcard-updated">{formatPmDate(board.updatedAt, locale)}</span>
    </section>
  );
}
