import type { BoardGroupBy } from "../boardKanban";

// Cards-mode shared vocabulary: register filter/sort, per-board body view and
// the one page-scoped localStorage UI state (per-project maps).

export type BoardsFilterMode = "all" | "favorites" | "withTasks";
export type BoardsSortKey = "manual" | "updatedAt" | "createdAt" | "name";
export type BoardsSortDirection = "asc" | "desc";

/** Per-board body view inside the expanded card (NOT global): kanban lanes or
 *  the grouped table, with the table's own group-by dimension. */
export interface BoardBodyView {
  mode: "kanban" | "table";
  groupBy: BoardGroupBy;
}
export const DEFAULT_BODY_VIEW: BoardBodyView = { mode: "kanban", groupBy: "column" };

export interface BoardCardsUiState {
  orderByProject: Record<string, string[]>;
  favoritesByProject: Record<string, string[]>;
  expandedByProject: Record<string, string[]>;
  sortKeyByProject: Record<string, BoardsSortKey>;
  sortDirectionByProject: Record<string, BoardsSortDirection>;
  filterModeByProject: Record<string, BoardsFilterMode>;
  bodyViewByProject: Record<string, Record<string, BoardBodyView>>;
  pageSizeByProject: Record<string, number>;
}

export const CARDS_UI_STORAGE_KEY = "aops-cockpit-v2.boards.cardsUi";
export const EMPTY_UI_STATE: BoardCardsUiState = {
  orderByProject: {},
  favoritesByProject: {},
  expandedByProject: {},
  sortKeyByProject: {},
  sortDirectionByProject: {},
  filterModeByProject: {},
  bodyViewByProject: {},
  pageSizeByProject: {}
};
export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 25, 50];
export const SORT_KEYS: BoardsSortKey[] = ["manual", "updatedAt", "createdAt", "name"];
export const FILTER_MODES: BoardsFilterMode[] = ["all", "favorites", "withTasks"];

export function readCardsUiState(): BoardCardsUiState {
  if (typeof window === "undefined") return EMPTY_UI_STATE;
  try {
    const raw = window.localStorage.getItem(CARDS_UI_STORAGE_KEY);
    if (!raw) return EMPTY_UI_STATE;
    const parsed = JSON.parse(raw) as Partial<BoardCardsUiState>;
    return { ...EMPTY_UI_STATE, ...parsed };
  } catch {
    return EMPTY_UI_STATE;
  }
}

export function writeCardsUiState(state: BoardCardsUiState): void {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(CARDS_UI_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}
