import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { resolvePaginationState } from "@aopslab/xf-ui-composition-react";
import {
  archivePmBoard,
  boardTasksQueryKey,
  deletePmBoard,
  isArchivedPmRecord,
  unarchivePmBoard,
  type CockpitPmBoard,
  type CockpitPmTask
} from "../../lib/projectman";
import { apiErrorMessage } from "../../lib/aopsApi";
import type { ProjectmanBoardsProps } from "./types";
import {
  DEFAULT_BODY_VIEW,
  DEFAULT_PAGE_SIZE,
  readCardsUiState,
  writeCardsUiState,
  type BoardBodyView,
  type BoardCardsUiState,
  type BoardsFilterMode,
  type BoardsSortDirection,
  type BoardsSortKey
} from "./board-cards/shared";
import { CloseIcon, LeftMenuModeIcon, NavigatorModeIcon, SearchIcon } from "./board-cards/icons";
import { BoardsPager, CardsFilterControl, CardsSortControl } from "./board-cards/CardsToolbarControls";
import { BoardRegisterCard } from "./board-cards/BoardRegisterCard";
import { BoardDetailPane } from "./board-cards/BoardDetailPane";
import { BoardDeleteModal } from "./board-cards/BoardDeleteModal";

// Cards mode (aops-desktop ProjectManager board-register parity): every board
// renders as a content-wide card — collapsible head (toggle + title +
// description + meta/uid), top-right round icon actions (detail · favorite ·
// move up/down · edit · kebab) and per-column stat chips; the expanded body
// shows the board's own kanban/table view with a board-scoped toolbar. A
// board-list toolbar (filter · sort · search · expand/collapse all · mode
// shortcuts · gear) sits above the paged register, and the detail action opens
// a sticky right pane (fixed height, inner scroll — ui-systemv2 §11.2
// register-detail pattern). Favorites / manual order / expansion / sort /
// filter / page size / per-board body views persist per project in one
// page-scoped localStorage key. Board tasks load lazily per board (see
// useBoardTasks). This file is the orchestrator (state + handlers + layout);
// the card / pane / modal / toolbar surfaces live under ./board-cards/.

export function ProjectmanBoardCards({ model, navigator, selectedBoardId, locale, t }: ProjectmanBoardsProps) {
  const projectKey = model.selectedProject?.key ?? "__global__";
  const [ui, setUi] = useState<BoardCardsUiState>(readCardsUiState);
  const [query, setQuery] = useState("");
  const [paneOpen, setPaneOpen] = useState(false);
  const [page, setPage] = useState(0);

  const patchUi = useCallback((mutate: (prev: BoardCardsUiState) => BoardCardsUiState) => {
    setUi((prev) => {
      const next = mutate(prev);
      writeCardsUiState(next);
      return next;
    });
  }, []);

  const boards = model.boards;
  const favorites = useMemo(() => new Set(ui.favoritesByProject[projectKey] ?? []), [projectKey, ui.favoritesByProject]);
  const expandedIds = useMemo(() => new Set(ui.expandedByProject[projectKey] ?? []), [projectKey, ui.expandedByProject]);
  const sortKey = ui.sortKeyByProject[projectKey] ?? "manual";
  const sortDirection = ui.sortDirectionByProject[projectKey] ?? "asc";
  const filterMode = ui.filterModeByProject[projectKey] ?? "all";
  const pageSize = ui.pageSizeByProject[projectKey] ?? DEFAULT_PAGE_SIZE;

  // Filter/search/scope changes reset the page cursor (ui-systemv2 §11).
  useEffect(() => {
    setPage(0);
  }, [projectKey, query, filterMode, sortKey, sortDirection, pageSize]);

  const sprintById = useMemo(() => new Map(model.sprints.map((sprint) => [sprint.id, sprint])), [model.sprints]);
  // Known per-board task counts from the lazy board-task caches (enabled:false
  // observers — they never fetch, they just watch what expanded cards loaded).
  // Boards never opened stay `undefined` (count unknown).
  const boardTaskCounts = useQueries({
    queries: boards.map((board) => ({
      queryKey: boardTasksQueryKey(model.client.identity, model.sessionKey, model.selectedProject, board.id),
      queryFn: async () =>
        model.client.get<CockpitPmTask[]>("/api/projectman/kanban-tasks", { board: board.id }),
      enabled: false,
      staleTime: 5 * 60_000
    })),
    combine: (results) =>
      new Map<string, number | undefined>(boards.map((board, index) => [board.id, results[index]?.data?.length]))
  });

  // Manual order: persisted ids first (dropping stale ids), new boards appended
  // in their base order — the aops-desktop applyBoardOrderForProject mechanic.
  const manualIds = useMemo(() => {
    const baseIds = boards.map((board) => board.id);
    const baseSet = new Set(baseIds);
    const stored = (ui.orderByProject[projectKey] ?? []).filter((id) => baseSet.has(id));
    const storedSet = new Set(stored);
    return [...stored, ...baseIds.filter((id) => !storedSet.has(id))];
  }, [boards, projectKey, ui.orderByProject]);

  const visibleBoards = useMemo(() => {
    const q = query.trim().toLowerCase();
    const orderIndex = new Map(manualIds.map((id, index) => [id, index]));
    const direction = sortDirection === "asc" ? 1 : -1;
    return boards
      .filter((board) => {
        if (filterMode === "favorites" && !favorites.has(board.id)) return false;
        // Lazy data: only boards KNOWN to be empty are hidden; boards whose
        // tasks were never loaded stay visible (count unknown).
        if (filterMode === "withTasks" && boardTaskCounts.get(board.id) === 0) return false;
        if (q && !`${board.name} ${board.slug ?? ""}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        const aFav = favorites.has(a.id);
        const bFav = favorites.has(b.id);
        if (aFav !== bFav) return aFav ? -1 : 1;
        if (sortKey === "manual") {
          return ((orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0)) * direction;
        }
        if (sortKey === "name") {
          return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }) * direction;
        }
        const aTime = Date.parse(a[sortKey] ?? "") || 0;
        const bTime = Date.parse(b[sortKey] ?? "") || 0;
        return (aTime - bTime) * direction;
      });
  }, [boardTaskCounts, boards, favorites, filterMode, manualIds, query, sortDirection, sortKey]);

  const toggleFavorite = useCallback(
    (boardId: string) =>
      patchUi((prev) => {
        const current = prev.favoritesByProject[projectKey] ?? [];
        const next = current.includes(boardId)
          ? current.filter((id) => id !== boardId)
          : [...current, boardId];
        return { ...prev, favoritesByProject: { ...prev.favoritesByProject, [projectKey]: next } };
      }),
    [patchUi, projectKey]
  );

  // Arrows edit the persisted manual order; the sort key snaps back to manual
  // so the move is immediately visible (favorites still float on top).
  const moveBoard = useCallback(
    (boardId: string, direction: "up" | "down") =>
      patchUi((prev) => {
        const baseIds = boards.map((board) => board.id);
        const baseSet = new Set(baseIds);
        const stored = (prev.orderByProject[projectKey] ?? []).filter((id) => baseSet.has(id));
        const storedSet = new Set(stored);
        const order = [...stored, ...baseIds.filter((id) => !storedSet.has(id))];
        const index = order.indexOf(boardId);
        const target = direction === "up" ? index - 1 : index + 1;
        if (index < 0 || target < 0 || target >= order.length) return prev;
        [order[index], order[target]] = [order[target], order[index]];
        return {
          ...prev,
          orderByProject: { ...prev.orderByProject, [projectKey]: order },
          sortKeyByProject: { ...prev.sortKeyByProject, [projectKey]: "manual" },
          sortDirectionByProject: { ...prev.sortDirectionByProject, [projectKey]: "asc" }
        };
      }),
    [boards, patchUi, projectKey]
  );

  const toggleExpanded = useCallback(
    (boardId: string) =>
      patchUi((prev) => {
        const current = prev.expandedByProject[projectKey] ?? [];
        const next = current.includes(boardId)
          ? current.filter((id) => id !== boardId)
          : [...current, boardId];
        return { ...prev, expandedByProject: { ...prev.expandedByProject, [projectKey]: next } };
      }),
    [patchUi, projectKey]
  );
  const setAllExpanded = useCallback(
    (expandAll: boolean) =>
      patchUi((prev) => ({
        ...prev,
        expandedByProject: {
          ...prev.expandedByProject,
          [projectKey]: expandAll ? boards.map((board) => board.id) : []
        }
      })),
    [boards, patchUi, projectKey]
  );
  const setFilterMode = useCallback(
    (mode: BoardsFilterMode) =>
      patchUi((prev) => ({
        ...prev,
        filterModeByProject: { ...prev.filterModeByProject, [projectKey]: mode }
      })),
    [patchUi, projectKey]
  );
  const setSort = useCallback(
    (key: BoardsSortKey, direction: BoardsSortDirection) =>
      patchUi((prev) => ({
        ...prev,
        sortKeyByProject: { ...prev.sortKeyByProject, [projectKey]: key },
        sortDirectionByProject: { ...prev.sortDirectionByProject, [projectKey]: direction }
      })),
    [patchUi, projectKey]
  );
  const setPageSize = useCallback(
    (size: number) =>
      patchUi((prev) => ({
        ...prev,
        pageSizeByProject: { ...prev.pageSizeByProject, [projectKey]: size }
      })),
    [patchUi, projectKey]
  );
  // Per-board expanded-body view (kanban/table + table group-by) — persisted
  // per project per board, so every board keeps its OWN view (not global).
  const bodyViews = ui.bodyViewByProject[projectKey] ?? {};
  const setBodyView = useCallback(
    (boardId: string, patch: Partial<BoardBodyView>) =>
      patchUi((prev) => {
        const forProject = prev.bodyViewByProject[projectKey] ?? {};
        const current = forProject[boardId] ?? DEFAULT_BODY_VIEW;
        return {
          ...prev,
          bodyViewByProject: {
            ...prev.bodyViewByProject,
            [projectKey]: { ...forProject, [boardId]: { ...current, ...patch } }
          }
        };
      }),
    [patchUi, projectKey]
  );

  const openDetail = useCallback(
    (boardId: string) => {
      navigator.selectRecord(boardId);
      setPaneOpen(true);
    },
    [navigator]
  );

  // Board lifecycle writes (kebab): archive/unarchive run immediately (soft,
  // reversible); delete goes through the confirm modal. refresh() re-reads the
  // hosted PM queries so the register/pane reflect the new state.
  const [busyBoardId, setBusyBoardId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CockpitPmBoard | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const toggleArchive = useCallback(
    async (board: CockpitPmBoard) => {
      setBusyBoardId(board.id);
      setActionError(null);
      try {
        if (isArchivedPmRecord(board)) await unarchivePmBoard(model.client, board.id);
        else await archivePmBoard(model.client, board.id);
        model.refresh();
      } catch (error) {
        setActionError(`${t("pmCardActionFailed")}: ${apiErrorMessage(error)}`);
      } finally {
        setBusyBoardId(null);
      }
    },
    [model, t]
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deletePmBoard(model.client, deleteTarget.id);
      setDeleteTarget(null);
      model.refresh();
    } catch (error) {
      setDeleteError(apiErrorMessage(error));
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, model]);

  const detailBoard = paneOpen ? boards.find((board) => board.id === selectedBoardId) ?? null : null;

  // Register pagination (default 10 boards/page; size persisted per project).
  const pageStart = resolvePaginationState({ total: visibleBoards.length, page, pageSize }).currentPage * pageSize;
  const pagedBoards = visibleBoards.slice(pageStart, pageStart + pageSize);

  return (
    <div className="aops-pm-cards-view" data-testid="aops-v2-boards-cards">
      <div className="aops-pm-cards-toolbar" role="toolbar" aria-label={t("pmCardsToolbar")}>
        <div className="aops-pm-cards-toolbar-lead">
          <CardsFilterControl filterMode={filterMode} onSetFilterMode={setFilterMode} t={t} />
          <CardsSortControl sortKey={sortKey} sortDirection={sortDirection} onSetSort={setSort} t={t} />
          <label className="aops-pm-cards-search">
            <span className="aops-pm-cards-search-icon" aria-hidden>
              {SearchIcon}
            </span>
            <input
              type="search"
              value={query}
              placeholder={t("pmNavSearchBoards")}
              aria-label={t("pmNavFilterBoards")}
              onChange={(event) => setQuery(event.target.value)}
              data-testid="aops-v2-boards-cards-search"
            />
            {query ? (
              <button
                type="button"
                className="aops-pm-cards-search-clear"
                aria-label={t("pmCardsSearchClear")}
                title={t("pmCardsSearchClear")}
                onClick={() => setQuery("")}
              >
                {CloseIcon}
              </button>
            ) : null}
          </label>
        </div>
        <div className="aops-pm-cards-toolbar-actions">
          <span className="aops-pm-cards-toolbar-sep" aria-hidden />
          <button type="button" className="aops-pm-cards-mini" onClick={() => setAllExpanded(true)}>
            {t("pmCardsExpandAll")}
          </button>
          <button type="button" className="aops-pm-cards-mini" onClick={() => setAllExpanded(false)}>
            {t("pmCardsCollapseAll")}
          </button>
          <span className="aops-pm-cards-toolbar-sep" aria-hidden />
          <button
            type="button"
            className="aops-pm-cards-tool-btn"
            aria-label={t("navModeNavigator")}
            title={t("navModeNavigator")}
            onClick={() => navigator.switchMode("navigator")}
            data-testid="aops-v2-boards-cards-shortcut-navigator"
          >
            {NavigatorModeIcon}
          </button>
          <button
            type="button"
            className="aops-pm-cards-tool-btn"
            aria-label={t("navModeLeftMenu")}
            title={t("navModeLeftMenu")}
            onClick={() => navigator.switchMode("left-menu")}
            data-testid="aops-v2-boards-cards-shortcut-leftmenu"
          >
            {LeftMenuModeIcon}
          </button>
          {navigator.gearNode}
        </div>
      </div>
      {actionError ? (
        <div className="aops-pm-cards-error" role="alert">
          <span>{actionError}</span>
          <button type="button" className="aops-pm-cards-search-clear" aria-label={t("pmCardCancel")} onClick={() => setActionError(null)}>
            {CloseIcon}
          </button>
        </div>
      ) : null}
      <div className={`aops-pm-cards-layout${detailBoard ? " has-pane" : ""}`}>
        <div className="aops-pm-cards-list">
          {pagedBoards.map((board, pageIndex) => {
            const index = pageStart + pageIndex;
            return (
            <BoardRegisterCard
              key={board.id}
              board={board}
              columns={model.columnsByBoard[board.id] ?? []}
              model={model}
              sprintById={sprintById}
              isFavorite={favorites.has(board.id)}
              isExpanded={expandedIds.has(board.id)}
              isSelected={Boolean(detailBoard && board.id === detailBoard.id)}
              canMoveUp={index > 0}
              canMoveDown={index < visibleBoards.length - 1}
              menuBusy={busyBoardId === board.id}
              bodyView={bodyViews[board.id] ?? DEFAULT_BODY_VIEW}
              onSetBodyView={(patch) => setBodyView(board.id, patch)}
              onToggleExpanded={() => toggleExpanded(board.id)}
              onToggleFavorite={() => toggleFavorite(board.id)}
              onMoveUp={() => moveBoard(board.id, "up")}
              onMoveDown={() => moveBoard(board.id, "down")}
              onOpenDetail={() => openDetail(board.id)}
              onToggleArchive={() => void toggleArchive(board)}
              onRequestDelete={() => {
                setDeleteError(null);
                setDeleteTarget(board);
              }}
              locale={locale}
              t={t}
            />
            );
          })}
          {visibleBoards.length === 0 ? <div className="aops-pm-cards-empty">{t("pmCardsEmpty")}</div> : null}
          {visibleBoards.length > 0 ? (
            <BoardsPager
              total={visibleBoards.length}
              page={page}
              pageSize={pageSize}
              visibleCount={pagedBoards.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              t={t}
            />
          ) : null}
        </div>
        {detailBoard ? (
          <BoardDetailPane
            board={detailBoard}
            columns={model.columnsByBoard[detailBoard.id] ?? []}
            model={model}
            onClose={() => setPaneOpen(false)}
            locale={locale}
            t={t}
          />
        ) : null}
      </div>
      {deleteTarget ? (
        <BoardDeleteModal
          board={deleteTarget}
          taskCount={boardTaskCounts.get(deleteTarget.id) ?? null}
          columnCount={model.columnsByBoard[deleteTarget.id]?.length ?? 0}
          busy={deleteBusy}
          error={deleteError}
          onCancel={() => {
            if (!deleteBusy) setDeleteTarget(null);
          }}
          onConfirm={() => void confirmDelete()}
          t={t}
        />
      ) : null}
    </div>
  );
}
