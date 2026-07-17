import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isArchivedPmRecord, type CockpitPmBoard, type CockpitPmTask } from "./projectman";
import {
  useRecordNavigator,
  type RecordNavigator,
  type RecordNavigatorConfig
} from "./recordNavigator";
import type { AopsCockpitTranslationKey } from "./i18n";

type NavT = (key: AopsCockpitTranslationKey) => string;

// Boards navigator — a thin grouping config over the shared record navigator
// (left-menu / navigator dock / searchable dropdown / cards register).

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
  tasks: CockpitPmTask[];
  selectedBoardId: string | null;
  onSelectBoard: (boardId: string) => void;
  /** Cards-mode flag mirror (App defers the project-wide tasks list on it). */
  onCardsModeChange?: (cards: boolean) => void;
}

type BoardStatusFilter = "all" | "active" | "archived";

const BOARD_FILTER_STORAGE_KEY = "aops-cockpit-v2.boards.statusFilter.v1";

function readBoardStatusFilter(): BoardStatusFilter {
  if (typeof window === "undefined") return "active";
  try {
    const value = window.localStorage.getItem(BOARD_FILTER_STORAGE_KEY);
    return value === "all" || value === "archived" || value === "active" ? value : "active";
  } catch {
    return "active";
  }
}

function BoardFilterIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
      <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function BoardStatusFilterControl({
  value,
  onChange,
  t
}: {
  value: BoardStatusFilter;
  onChange: (value: BoardStatusFilter) => void;
  t: NavT;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return undefined;
    const placeMenu = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuWidth = 216;
      setPosition({
        top: rect.bottom + 8,
        left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8))
      });
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    placeMenu();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
    };
  }, [open]);

  const options: Array<{ value: BoardStatusFilter; label: string }> = [
    { value: "all", label: t("pmCardsFilterAll") },
    { value: "active", label: t("navActiveGroup") },
    { value: "archived", label: t("navArchivedGroup") }
  ];
  const selectedLabel = options.find((option) => option.value === value)?.label ?? options[0].label;

  return (
    <div className="aops-v2-board-filter">
      <button
        ref={buttonRef}
        type="button"
        className={`aops-v2-board-filter-button${value !== "all" ? " is-filtered" : ""}`}
        aria-label={`${t("pmNavFilterBoards")}: ${selectedLabel}`}
        title={`${t("pmNavFilterBoards")}: ${selectedLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        data-testid="aops-v2-boards-status-filter"
      >
        <BoardFilterIcon />
        {value !== "all" ? <span className="aops-v2-board-filter-dot" aria-hidden="true" /> : null}
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              className="aops-v2-board-filter-menu"
              role="menu"
              aria-label={t("pmNavFilterBoards")}
              style={{ top: position.top, left: position.left }}
              data-testid="aops-v2-boards-status-filter-menu"
            >
              <span className="aops-v2-board-filter-menu-title">{t("pmNavFilterBoards")}</span>
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={value === option.value}
                  className={`aops-v2-board-filter-option${value === option.value ? " is-selected" : ""}`}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span className="aops-v2-board-filter-radio" aria-hidden="true" />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

export function useBoardsNavigator(model: BoardsNavigatorModel, t: NavT): BoardsNavigator {
  const [statusFilter, setStatusFilter] = useState<BoardStatusFilter>(readBoardStatusFilter);
  const handleStatusFilterChange = (next: BoardStatusFilter) => {
    setStatusFilter(next);
    try {
      window.localStorage.setItem(BOARD_FILTER_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };
  const visibleBoards = useMemo(
    () => model.boards.filter((board) => {
      if (statusFilter === "all") return true;
      const archived = isArchivedPmRecord(board);
      return statusFilter === "archived" ? archived : !archived;
    }),
    [model.boards, statusFilter]
  );
  const taskSearchByBoardId = useMemo(() => {
    const taskParts = new Map<string, string[]>();
    for (const task of model.tasks) {
      if (!task.boardId) continue;
      const parts = taskParts.get(task.boardId) ?? [];
      parts.push(task.taskCode ?? "", task.title ?? "", task.description ?? "", task.status ?? "");
      taskParts.set(task.boardId, parts);
    }
    return new Map([...taskParts].map(([boardId, parts]) => [boardId, parts.join(" ")]));
  }, [model.tasks]);
  const config = useMemo<RecordNavigatorConfig<CockpitPmBoard>>(
    () => ({
      storagePrefix: "aops-cockpit-v2.boards",
      testIdPrefix: "aops-v2-boards",
      dockClassName: "aops-v2-boards-navdock",
      treeClassName: "aops-v2-boards-tree",
      flattenSingleGroup: true,
      enableFavorites: true,
      searchTrailingSlot: (
        <BoardStatusFilterControl value={statusFilter} onChange={handleStatusFilterChange} t={t} />
      ),
      // Cards mode: the boards page renders the aops-desktop-style card register.
      enableCardsMode: true,
      showDropdownSettings: false,
      showDropdownMeta: false,
      showModeShortcuts: false,
      showTreeSettings: false,
      showTreeClose: true,
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
          key: "boards",
          label: t("pmNavBoardsPanelTitle"),
          items: visibleBoards
        }
      ],
      itemKey: (board) => board.id,
      itemLabel: (board) => board.name,
      itemMeta: (board) => (board.slug && board.slug !== board.name ? [board.slug] : undefined),
      searchText: (board) => `${board.name} ${board.slug ?? ""} ${taskSearchByBoardId.get(board.id) ?? ""}`,
      selectedKey: model.selectedBoardId,
      onSelect: model.onSelectBoard
    }),
    [model.onCardsModeChange, model.onSelectBoard, model.selectedBoardId, statusFilter, t, taskSearchByBoardId, visibleBoards]
  );
  return useRecordNavigator(config, t);
}
