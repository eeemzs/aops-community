import { useMemo } from "react";
import { isArchivedPmRecord, type CockpitPmBoard } from "./projectman";
import {
  useRecordNavigator,
  type RecordNavigator,
  type RecordNavigatorConfig
} from "./recordNavigator";
import type { AopsCockpitTranslationKey } from "./i18n";

type NavT = (key: AopsCockpitTranslationKey) => string;

// Boards navigator — a thin grouping config over the shared record navigator
// (left-menu / navigator dock / searchable dropdown / cards register). Groups:
// Active boards / Archived.

const BoardIcon = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
    <path
      d="M4 5h5v14H4zM10 5h4v14h-4zM15 5h5v14h-5z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

export type BoardsViewMode = RecordNavigator["viewMode"];
export type BoardsNavigator = RecordNavigator;

export interface BoardsNavigatorModel {
  boards: CockpitPmBoard[];
  selectedBoardId: string | null;
  onSelectBoard: (boardId: string) => void;
  /** Cards-mode flag mirror (App defers the project-wide tasks list on it). */
  onCardsModeChange?: (cards: boolean) => void;
}

export function useBoardsNavigator(model: BoardsNavigatorModel, t: NavT): BoardsNavigator {
  const config = useMemo<RecordNavigatorConfig<CockpitPmBoard>>(
    () => ({
      storagePrefix: "aops-cockpit-v2.boards",
      testIdPrefix: "aops-v2-boards",
      dockClassName: "aops-v2-boards-navdock",
      // Cards mode: the boards page renders the aops-desktop-style card register.
      enableCardsMode: true,
      showDropdownSettings: false,
      showDropdownMeta: false,
      showModeShortcuts: false,
      showNavigatorSetting: false,
      leftMenuModeLabel: "pmRecordViewSidePanel",
      settingsModeOrder: ["left-menu", "cards", "dropdown"],
      onCardsModeChange: model.onCardsModeChange,
      labels: {
        panelTitle: "pmNavBoardsPanelTitle",
        paneAria: "pmNavBoardsPane",
        toolsAria: "pmNavBoardTools",
        searchPlaceholder: "pmNavSearchBoards",
        searchAria: "pmNavFilterBoards",
        empty: "pmNavNoBoards",
        emptySearch: "pmNavNoBoardsMatch",
        unclassified: "pmNavUntitledBoard",
        dropdownKicker: "pmNavBoardK",
        dropdownSelect: "pmNavSelectBoard"
      },
      dropdownIcon: BoardIcon,
      groups: [
        {
          key: "active",
          label: t("pmNavActiveBoards"),
          items: model.boards.filter((board) => !isArchivedPmRecord(board))
        },
        {
          key: "archived",
          label: t("navArchivedGroup"),
          items: model.boards.filter((board) => isArchivedPmRecord(board))
        }
      ],
      itemKey: (board) => board.id,
      itemLabel: (board) => board.name,
      itemMeta: (board) => (board.slug && board.slug !== board.name ? [board.slug] : undefined),
      searchText: (board) => `${board.name} ${board.slug ?? ""}`,
      selectedKey: model.selectedBoardId,
      onSelect: model.onSelectBoard
    }),
    [model.boards, model.onCardsModeChange, model.onSelectBoard, model.selectedBoardId, t]
  );
  return useRecordNavigator(config, t);
}
