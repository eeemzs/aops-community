import type { SprintPhaseView, SprintTabId } from "../sprintDetailBody";

// Sprint-cards shared vocabulary (boards cards-mode parity): register
// filter/sort, per-record body view and the page-scoped localStorage UI state.

export type SprintsFilterMode = "all" | "sprints" | "plans" | "favorites";
export type SprintsSortKey = "manual" | "updatedAt" | "createdAt" | "name";
export type SprintsSortDirection = "asc" | "desc";

/** Per-record body view inside the expanded card (NOT global). */
export interface SprintBodyView {
  tab: SprintTabId;
  phaseView: SprintPhaseView;
}
export const DEFAULT_SPRINT_BODY_VIEW: SprintBodyView = { tab: "phases", phaseView: "accordion" };

export interface SprintCardsUiState {
  orderByProject: Record<string, string[]>;
  favoritesByProject: Record<string, string[]>;
  expandedByProject: Record<string, string[]>;
  sortKeyByProject: Record<string, SprintsSortKey>;
  sortDirectionByProject: Record<string, SprintsSortDirection>;
  filterModeByProject: Record<string, SprintsFilterMode>;
  bodyViewByProject: Record<string, Record<string, SprintBodyView>>;
  pageSizeByProject: Record<string, number>;
}

export const SPRINT_CARDS_UI_STORAGE_KEY = "aops-cockpit-v2.sprints.cardsUi";
export const EMPTY_SPRINT_UI_STATE: SprintCardsUiState = {
  orderByProject: {},
  favoritesByProject: {},
  expandedByProject: {},
  sortKeyByProject: {},
  sortDirectionByProject: {},
  filterModeByProject: {},
  bodyViewByProject: {},
  pageSizeByProject: {}
};
export const SPRINT_FILTER_MODES: SprintsFilterMode[] = ["all", "sprints", "plans", "favorites"];

export function readSprintCardsUiState(): SprintCardsUiState {
  if (typeof window === "undefined") return EMPTY_SPRINT_UI_STATE;
  try {
    const raw = window.localStorage.getItem(SPRINT_CARDS_UI_STORAGE_KEY);
    if (!raw) return EMPTY_SPRINT_UI_STATE;
    const parsed = JSON.parse(raw) as Partial<SprintCardsUiState>;
    return { ...EMPTY_SPRINT_UI_STATE, ...parsed };
  } catch {
    return EMPTY_SPRINT_UI_STATE;
  }
}

export function writeSprintCardsUiState(state: SprintCardsUiState): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SPRINT_CARDS_UI_STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    /* ignore */
  }
}
