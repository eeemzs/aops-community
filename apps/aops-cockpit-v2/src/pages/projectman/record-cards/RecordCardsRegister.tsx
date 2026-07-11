import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { resolvePaginationState } from "@aopslab/xf-ui-composition-react";
import { apiErrorMessage } from "../../../lib/aopsApi";
import type { RecordListItem } from "../../../components/recordMasterDetail";
import type { AopsCockpitLocale } from "../../../lib/i18n";
import type { TFn } from "../types";
import {
  readRecordCardsUiState,
  writeRecordCardsUiState,
  type RecordCardsUiState,
  type RecordsFilterMode,
  type RecordsSortDirection,
  type RecordsSortKey
} from "./shared";
import { DEFAULT_PAGE_SIZE } from "../board-cards/shared";
import { CloseIcon, FunnelIcon, SearchIcon, usePopover } from "../board-cards/icons";
import { BoardsPager, CardsSortControl } from "../board-cards/CardsToolbarControls";
import { RecordRegisterCard } from "./RecordCard";
import { RecordPane } from "./RecordPane";
import { RecordDeleteModal } from "./RecordDeleteModal";

// Generic flat-record cards register (Issues / Feedback / Reviews): the
// boards/sprints cards grammar over already-loaded RecordListItem rows —
// status filter popover, sort, search, favorites-first manual order, paging,
// sticky right pane and delete-only kebab (via the section's delete route).

function RecordsFilterControl({
  filterMode,
  statuses,
  onSetFilterMode,
  t
}: {
  filterMode: RecordsFilterMode;
  statuses: string[];
  onSetFilterMode: (mode: RecordsFilterMode) => void;
  t: TFn;
}) {
  const { open, setOpen, rootRef } = usePopover();
  const label = (mode: RecordsFilterMode): string =>
    mode === "all" ? t("pmRecordsAllStatuses") : mode === "favorites" ? t("pmCardsFilterFavorites") : mode;
  const options: RecordsFilterMode[] = ["all", "favorites", ...statuses];
  return (
    <div className="aops-pm-cards-popwrap" ref={rootRef}>
      <button
        type="button"
        className={`aops-pm-cards-tool-btn${filterMode !== "all" ? " is-active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("pmSprintCardsFilterTitle")}
        title={t("pmSprintCardsFilterTitle")}
        onClick={() => setOpen((v) => !v)}
        data-testid="aops-v2-records-cards-filter"
      >
        {FunnelIcon}
        {filterMode !== "all" ? <span className="aops-pm-cards-tool-badge">1</span> : null}
      </button>
      {open ? (
        <div className="aops-pm-cards-popmenu" role="menu">
          <div className="aops-pm-cards-popmenu-head">
            <div>
              <h3>{t("pmSprintCardsFilterTitle")}</h3>
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
          <span className="aops-pm-cards-popmenu-label">{t("pmFieldStatus")}</span>
          {options.map((mode) => (
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
                <b>{label(mode)}</b>
              </span>
              {filterMode === mode ? <span className="aops-pm-cards-popmenu-check">✓</span> : null}
            </button>
          ))}
          <div className="aops-pm-cards-popmenu-summary">
            <span>{t("pmCardsFilterActive")}</span>
            <strong>{label(filterMode)}</strong>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RecordCardsRegister({
  projectKey,
  section,
  items,
  sectionTitle,
  searchPlaceholder,
  emptyLabel,
  onDeleteRecord,
  renderExtra,
  toolbarExtra,
  toolbarTrailing,
  locale,
  t
}: {
  /** Persistence scope (selected project key or "__global__"). */
  projectKey: string;
  /** Section key for scoped persistence (e.g. issues | as-memory | runs-runs). */
  section: string;
  items: RecordListItem[];
  sectionTitle: string;
  searchPlaceholder: string;
  emptyLabel: string;
  /** Delete handler (must include the data refresh); omit → no kebab. */
  onDeleteRecord?: (item: RecordListItem) => Promise<void>;
  /** Section-specific expanded-body/pane extra (detailExtra equivalent). */
  renderExtra?: (item: RecordListItem) => ReactNode;
  /** Extra toolbar control (e.g. the Memory kind filter). */
  toolbarExtra?: ReactNode;
  /** Trailing toolbar controls (e.g. navigator mode shortcuts + gear). */
  toolbarTrailing?: ReactNode;
  locale: AopsCockpitLocale;
  t: TFn;
}) {
  const scopeKey = `${projectKey}:${section}`;
  const [ui, setUi] = useState<RecordCardsUiState>(readRecordCardsUiState);
  const [query, setQuery] = useState("");
  const [paneItemId, setPaneItemId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const patchUi = useCallback((mutate: (prev: RecordCardsUiState) => RecordCardsUiState) => {
    setUi((prev) => {
      const next = mutate(prev);
      writeRecordCardsUiState(next);
      return next;
    });
  }, []);

  const favorites = useMemo(() => new Set(ui.favoritesByScope[scopeKey] ?? []), [scopeKey, ui.favoritesByScope]);
  const expandedIds = useMemo(() => new Set(ui.expandedByScope[scopeKey] ?? []), [scopeKey, ui.expandedByScope]);
  const sortKey = ui.sortKeyByScope[scopeKey] ?? "updatedAt";
  const sortDirection = ui.sortDirectionByScope[scopeKey] ?? "desc";
  const filterMode = ui.filterModeByScope[scopeKey] ?? "all";
  const pageSize = ui.pageSizeByScope[scopeKey] ?? DEFAULT_PAGE_SIZE;

  // Filter/search/scope changes reset the page cursor (ui-systemv2 §11).
  useEffect(() => {
    setPage(0);
  }, [scopeKey, query, filterMode, sortKey, sortDirection, pageSize]);

  const statuses = useMemo(
    () =>
      Array.from(new Set(items.map((item) => (item.status ?? "").trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [items]
  );

  const manualIds = useMemo(() => {
    const baseIds = items.map((item) => item.id);
    const baseSet = new Set(baseIds);
    const stored = (ui.orderByScope[scopeKey] ?? []).filter((id) => baseSet.has(id));
    const storedSet = new Set(stored);
    return [...stored, ...baseIds.filter((id) => !storedSet.has(id))];
  }, [items, scopeKey, ui.orderByScope]);

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const orderIndex = new Map(manualIds.map((id, index) => [id, index]));
    const direction = sortDirection === "asc" ? 1 : -1;
    return items
      .filter((item) => {
        if (filterMode === "favorites" && !favorites.has(item.id)) return false;
        if (filterMode !== "all" && filterMode !== "favorites" && (item.status ?? "").trim() !== filterMode) {
          return false;
        }
        if (q && !item.searchText.toLowerCase().includes(q)) return false;
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
          return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }) * direction;
        }
        const aTime = Date.parse((sortKey === "updatedAt" ? a.updatedAt : a.createdAt) ?? "") || 0;
        const bTime = Date.parse((sortKey === "updatedAt" ? b.updatedAt : b.createdAt) ?? "") || 0;
        return (aTime - bTime) * direction;
      });
  }, [favorites, filterMode, items, manualIds, query, sortDirection, sortKey]);

  const toggleFavorite = useCallback(
    (id: string) =>
      patchUi((prev) => {
        const current = prev.favoritesByScope[scopeKey] ?? [];
        const next = current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
        return { ...prev, favoritesByScope: { ...prev.favoritesByScope, [scopeKey]: next } };
      }),
    [patchUi, scopeKey]
  );
  const moveItem = useCallback(
    (id: string, direction: "up" | "down") =>
      patchUi((prev) => {
        const baseIds = items.map((item) => item.id);
        const baseSet = new Set(baseIds);
        const stored = (prev.orderByScope[scopeKey] ?? []).filter((entry) => baseSet.has(entry));
        const storedSet = new Set(stored);
        const order = [...stored, ...baseIds.filter((entry) => !storedSet.has(entry))];
        const index = order.indexOf(id);
        const target = direction === "up" ? index - 1 : index + 1;
        if (index < 0 || target < 0 || target >= order.length) return prev;
        [order[index], order[target]] = [order[target], order[index]];
        return {
          ...prev,
          orderByScope: { ...prev.orderByScope, [scopeKey]: order },
          sortKeyByScope: { ...prev.sortKeyByScope, [scopeKey]: "manual" },
          sortDirectionByScope: { ...prev.sortDirectionByScope, [scopeKey]: "asc" }
        };
      }),
    [items, patchUi, scopeKey]
  );
  const toggleExpanded = useCallback(
    (id: string) =>
      patchUi((prev) => {
        const current = prev.expandedByScope[scopeKey] ?? [];
        const next = current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
        return { ...prev, expandedByScope: { ...prev.expandedByScope, [scopeKey]: next } };
      }),
    [patchUi, scopeKey]
  );
  const setAllExpanded = useCallback(
    (expandAll: boolean) =>
      patchUi((prev) => ({
        ...prev,
        expandedByScope: {
          ...prev.expandedByScope,
          [scopeKey]: expandAll ? items.map((item) => item.id) : []
        }
      })),
    [items, patchUi, scopeKey]
  );
  const setFilterMode = useCallback(
    (mode: RecordsFilterMode) =>
      patchUi((prev) => ({
        ...prev,
        filterModeByScope: { ...prev.filterModeByScope, [scopeKey]: mode }
      })),
    [patchUi, scopeKey]
  );
  const setSort = useCallback(
    (key: RecordsSortKey, direction: RecordsSortDirection) =>
      patchUi((prev) => ({
        ...prev,
        sortKeyByScope: { ...prev.sortKeyByScope, [scopeKey]: key },
        sortDirectionByScope: { ...prev.sortDirectionByScope, [scopeKey]: direction }
      })),
    [patchUi, scopeKey]
  );
  const setPageSize = useCallback(
    (size: number) =>
      patchUi((prev) => ({
        ...prev,
        pageSizeByScope: { ...prev.pageSizeByScope, [scopeKey]: size }
      })),
    [patchUi, scopeKey]
  );

  // Delete-only lifecycle (no archive ops for flat records); the handler is
  // caller-supplied and owns the data refresh. No handler → no kebab at all.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RecordListItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || !onDeleteRecord) return;
    setDeleteBusy(true);
    setDeleteError(null);
    setBusyId(deleteTarget.id);
    try {
      await onDeleteRecord(deleteTarget);
      setDeleteTarget(null);
      if (paneItemId === deleteTarget.id) setPaneItemId(null);
    } catch (error) {
      setDeleteError(apiErrorMessage(error));
    } finally {
      setDeleteBusy(false);
      setBusyId(null);
    }
  }, [deleteTarget, onDeleteRecord, paneItemId]);

  const paneItem = paneItemId ? items.find((item) => item.id === paneItemId) ?? null : null;
  const pageStart = resolvePaginationState({ total: visibleItems.length, page, pageSize }).currentPage * pageSize;
  const pagedItems = visibleItems.slice(pageStart, pageStart + pageSize);

  return (
    <div className="aops-pm-cards-view" data-testid="aops-v2-records-cards">
      <div className="aops-pm-cards-toolbar" role="toolbar" aria-label={t("pmCardsToolbar")}>
        <div className="aops-pm-cards-toolbar-lead">
          <RecordsFilterControl
            filterMode={filterMode}
            statuses={statuses}
            onSetFilterMode={setFilterMode}
            t={t}
          />
          <CardsSortControl sortKey={sortKey} sortDirection={sortDirection} onSetSort={setSort} t={t} />
          {toolbarExtra}
          <label className="aops-pm-cards-search">
            <span className="aops-pm-cards-search-icon" aria-hidden>
              {SearchIcon}
            </span>
            <input
              type="search"
              value={query}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              onChange={(event) => setQuery(event.target.value)}
              data-testid="aops-v2-records-cards-search"
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
          {toolbarTrailing}
        </div>
      </div>
      <div className={`aops-pm-cards-layout${paneItem ? " has-pane" : ""}`}>
        <div className="aops-pm-cards-list">
          {pagedItems.map((item, pageIndex) => {
            const index = pageStart + pageIndex;
            return (
              <RecordRegisterCard
                key={item.id}
                item={item}
                isFavorite={favorites.has(item.id)}
                isExpanded={expandedIds.has(item.id)}
                isSelected={Boolean(paneItem && item.id === paneItem.id)}
                canMoveUp={index > 0}
                canMoveDown={index < visibleItems.length - 1}
                menuBusy={busyId === item.id}
                onToggleExpanded={() => toggleExpanded(item.id)}
                onToggleFavorite={() => toggleFavorite(item.id)}
                onMoveUp={() => moveItem(item.id, "up")}
                onMoveDown={() => moveItem(item.id, "down")}
                onOpenDetail={() => setPaneItemId(item.id)}
                onRequestDelete={
                  onDeleteRecord
                    ? () => {
                        setDeleteError(null);
                        setDeleteTarget(item);
                      }
                    : undefined
                }
                extra={renderExtra?.(item)}
                locale={locale}
                t={t}
              />
            );
          })}
          {visibleItems.length === 0 ? <div className="aops-pm-cards-empty">{emptyLabel}</div> : null}
          {visibleItems.length > 0 ? (
            <BoardsPager
              total={visibleItems.length}
              page={page}
              pageSize={pageSize}
              visibleCount={pagedItems.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              noun={t("pmSprintCardsPagerNoun")}
              testIdPrefix="aops-v2-records-cards"
              t={t}
            />
          ) : null}
        </div>
        {paneItem ? (
          <RecordPane
            item={paneItem}
            sectionTitle={sectionTitle}
            onClose={() => setPaneItemId(null)}
            extra={renderExtra?.(paneItem)}
            locale={locale}
            t={t}
          />
        ) : null}
      </div>
      {deleteTarget ? (
        <RecordDeleteModal
          item={deleteTarget}
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
