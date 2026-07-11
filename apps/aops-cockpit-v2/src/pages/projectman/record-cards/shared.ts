// Record-cards shared vocabulary (Issues / Feedback / Reviews register —
// boards/sprints cards-mode parity for flat PM records). UI state persists in
// one page-scoped localStorage key, maps keyed by `${projectKey}:${section}`.

export type RecordsSortKey = "manual" | "updatedAt" | "createdAt" | "name";
export type RecordsSortDirection = "asc" | "desc";
/** "all" | "favorites" | a concrete status value from the loaded records. */
export type RecordsFilterMode = string;

export interface RecordCardsUiState {
  orderByScope: Record<string, string[]>;
  favoritesByScope: Record<string, string[]>;
  expandedByScope: Record<string, string[]>;
  sortKeyByScope: Record<string, RecordsSortKey>;
  sortDirectionByScope: Record<string, RecordsSortDirection>;
  filterModeByScope: Record<string, RecordsFilterMode>;
  pageSizeByScope: Record<string, number>;
  /** Section view (cards register vs the legacy master-detail list), keyed
   *  `${projectKey}:${section}` like the other maps (plain legacy `section`
   *  keys are still read as a fallback). */
  viewBySection: Record<string, "cards" | "list">;
}

export const RECORD_CARDS_UI_STORAGE_KEY = "aops-cockpit-v2.pm-records.cardsUi";
export const EMPTY_RECORD_UI_STATE: RecordCardsUiState = {
  orderByScope: {},
  favoritesByScope: {},
  expandedByScope: {},
  sortKeyByScope: {},
  sortDirectionByScope: {},
  filterModeByScope: {},
  pageSizeByScope: {},
  viewBySection: {}
};

export function readRecordCardsUiState(): RecordCardsUiState {
  if (typeof window === "undefined") return EMPTY_RECORD_UI_STATE;
  try {
    const raw = window.localStorage.getItem(RECORD_CARDS_UI_STORAGE_KEY);
    if (!raw) return EMPTY_RECORD_UI_STATE;
    const parsed = JSON.parse(raw) as Partial<RecordCardsUiState>;
    return { ...EMPTY_RECORD_UI_STATE, ...parsed };
  } catch {
    return EMPTY_RECORD_UI_STATE;
  }
}

export function writeRecordCardsUiState(state: RecordCardsUiState): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(RECORD_CARDS_UI_STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    /* ignore */
  }
}
