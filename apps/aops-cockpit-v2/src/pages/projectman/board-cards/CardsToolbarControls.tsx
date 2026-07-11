import { resolvePaginationState } from "@aopslab/xf-ui-composition-react";
import { SegmentedControl } from "../components";
import type { TFn } from "../types";
import {
  FILTER_MODES,
  PAGE_SIZE_OPTIONS,
  SORT_KEYS,
  type BoardsFilterMode,
  type BoardsSortDirection,
  type BoardsSortKey
} from "./shared";
import { DownIcon, FunnelIcon, UpIcon, usePopover } from "./icons";

// Register-level toolbar controls (cards mode): board-list filter popover,
// sort field/direction popover and the eops-grammar pager.

export function CardsFilterControl({
  filterMode,
  onSetFilterMode,
  t
}: {
  filterMode: BoardsFilterMode;
  onSetFilterMode: (mode: BoardsFilterMode) => void;
  t: TFn;
}) {
  const { open, setOpen, rootRef } = usePopover();
  const labels: Record<BoardsFilterMode, string> = {
    all: t("pmCardsFilterAll"),
    favorites: t("pmCardsFilterFavorites"),
    withTasks: t("pmCardsFilterWithTasks")
  };
  const notes: Record<BoardsFilterMode, string> = {
    all: t("pmCardsFilterAllNote"),
    favorites: t("pmCardsFilterFavoritesNote"),
    withTasks: t("pmCardsFilterWithTasksNote")
  };
  return (
    <div className="aops-pm-cards-popwrap" ref={rootRef}>
      <button
        type="button"
        className={`aops-pm-cards-tool-btn${filterMode !== "all" ? " is-active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("pmCardsFilterTitle")}
        title={t("pmCardsFilterTitle")}
        onClick={() => setOpen((v) => !v)}
        data-testid="aops-v2-boards-cards-filter"
      >
        {FunnelIcon}
        {filterMode !== "all" ? <span className="aops-pm-cards-tool-badge">1</span> : null}
      </button>
      {open ? (
        <div className="aops-pm-cards-popmenu" role="menu">
          <div className="aops-pm-cards-popmenu-head">
            <div>
              <h3>{t("pmCardsFilterTitle")}</h3>
              <p>{t("pmCardsFilterScope")}</p>
            </div>
            <button
              type="button"
              className="aops-pm-cards-popmenu-clear"
              disabled={filterMode === "all"}
              onClick={() => {
                onSetFilterMode("all");
                setOpen(false);
              }}
            >
              {t("pmCardsFilterClear")}
            </button>
          </div>
          <span className="aops-pm-cards-popmenu-label">{t("pmCardsFilterLabel")}</span>
          {FILTER_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              role="menuitemradio"
              aria-checked={filterMode === mode}
              className={`aops-pm-cards-popmenu-option${filterMode === mode ? " is-active" : ""}`}
              onClick={() => {
                onSetFilterMode(mode);
                setOpen(false);
              }}
            >
              <span className="aops-pm-cards-popmenu-option-copy">
                <b>{labels[mode]}</b>
                <small>{notes[mode]}</small>
              </span>
              {filterMode === mode ? <span className="aops-pm-cards-popmenu-check">✓</span> : null}
            </button>
          ))}
          <div className="aops-pm-cards-popmenu-summary">
            <span>{t("pmCardsFilterActive")}</span>
            <strong>{labels[filterMode]}</strong>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CardsSortControl({
  sortKey,
  sortDirection,
  onSetSort,
  t
}: {
  sortKey: BoardsSortKey;
  sortDirection: BoardsSortDirection;
  onSetSort: (key: BoardsSortKey, direction: BoardsSortDirection) => void;
  t: TFn;
}) {
  const { open, setOpen, rootRef } = usePopover();
  const labels: Record<BoardsSortKey, string> = {
    manual: t("pmCardsSortManual"),
    updatedAt: t("pmCardsSortUpdated"),
    createdAt: t("pmCardsSortCreated"),
    name: t("pmCardsSortName")
  };
  return (
    <div className="aops-pm-cards-popwrap aops-pm-cards-sort" ref={rootRef}>
      <button
        type="button"
        className={`aops-pm-cards-tool-btn aops-pm-cards-sort-field${sortKey !== "manual" ? " is-active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${t("pmCardsSortBy")}: ${labels[sortKey]}`}
        onClick={() => setOpen((v) => !v)}
        data-testid="aops-v2-boards-cards-sort"
      >
        <span className="aops-pm-cards-sort-label">{t("pmCardsSortBy")}</span>
      </button>
      <button
        type="button"
        className="aops-pm-cards-tool-btn"
        aria-label={t("pmCardsSortDirection")}
        title={sortDirection === "asc" ? t("pmCardsSortAsc") : t("pmCardsSortDesc")}
        onClick={() => onSetSort(sortKey, sortDirection === "asc" ? "desc" : "asc")}
        data-testid="aops-v2-boards-cards-sortdir"
      >
        {sortDirection === "asc" ? UpIcon : DownIcon}
      </button>
      {open ? (
        <div className="aops-pm-cards-popmenu" role="menu">
          <span className="aops-pm-cards-popmenu-label">{t("pmCardsSortBy")}</span>
          {SORT_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              role="menuitemradio"
              aria-checked={sortKey === key}
              className={`aops-pm-cards-popmenu-option${sortKey === key ? " is-active" : ""}`}
              onClick={() => {
                onSetSort(key, sortDirection);
                setOpen(false);
              }}
            >
              <span className="aops-pm-cards-popmenu-option-copy">
                <b>{labels[key]}</b>
              </span>
              {sortKey === key ? <span className="aops-pm-cards-popmenu-check">✓</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Register pager (eops collection-pagination grammar via the shared
// resolvePaginationState; local render for localized copy).
export function BoardsPager({
  total,
  page,
  pageSize,
  visibleCount,
  onPageChange,
  onPageSizeChange,
  noun,
  testIdPrefix = "aops-v2-boards-cards",
  t
}: {
  total: number;
  page: number;
  pageSize: number;
  visibleCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  /** Localized record noun (defaults to the boards noun). */
  noun?: string;
  testIdPrefix?: string;
  t: TFn;
}) {
  const state = resolvePaginationState({ total, page, pageSize, visibleCount });
  return (
    <div className="collection-pagination aops-pm-cards-pager" data-testid={`${testIdPrefix}-pager`}>
      <span className="collection-pagination-count">
        {state.start}-{state.end} / {state.total} {noun ?? t("pmCardsPagerNoun")}
      </span>
      <div className="collection-pagination-controls">
        <label className="aops-pm-cards-pagesize">
          <span>{t("pmCardsPageSize")}</span>
          <SegmentedControl
            compact
            ariaLabel={t("pmCardsPageSize")}
            value={String(pageSize)}
            items={PAGE_SIZE_OPTIONS.map((size) => ({ value: String(size), label: String(size) }))}
            onChange={(value) => onPageSizeChange(Number(value))}
          />
        </label>
        <button
          className="mini-button ghost"
          type="button"
          onClick={() => onPageChange(state.currentPage - 1)}
          disabled={!state.canGoPrev}
          data-testid={`${testIdPrefix}-pager-prev`}
        >
          {t("pmCardsPagerPrev")}
        </button>
        <span className="collection-pagination-page">
          {t("pmCardsPagerPage")} {state.currentPage + 1} / {state.totalPages}
        </span>
        <button
          className="mini-button ghost"
          type="button"
          onClick={() => onPageChange(state.currentPage + 1)}
          disabled={!state.canGoNext}
          data-testid={`${testIdPrefix}-pager-next`}
        >
          {t("pmCardsPagerNext")}
        </button>
      </div>
    </div>
  );
}
