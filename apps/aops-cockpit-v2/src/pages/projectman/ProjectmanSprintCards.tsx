import { useCallback, useEffect, useMemo, useState } from "react";
import { resolvePaginationState } from "@aopslab/xf-ui-composition-react";
import {
  archivePmSprint,
  deletePmSprint,
  unarchivePmSprint,
  type ProjectmanDataModel
} from "../../lib/projectman";
import { apiErrorMessage } from "../../lib/aopsApi";
import type { AopsCockpitLocale } from "../../lib/i18n";
import type { SprintsNavigator } from "../../lib/sprintsNavigator";
import type { PlanRecordItem, TFn } from "./types";
import {
  DEFAULT_SPRINT_BODY_VIEW,
  readSprintCardsUiState,
  SPRINT_FILTER_MODES,
  writeSprintCardsUiState,
  type SprintBodyView,
  type SprintCardsUiState,
  type SprintsFilterMode,
  type SprintsSortDirection,
  type SprintsSortKey
} from "./sprint-cards/shared";
import { DEFAULT_PAGE_SIZE } from "./board-cards/shared";
import {
  CloseIcon,
  FunnelIcon,
  SearchIcon,
  usePopover
} from "./board-cards/icons";
import { BoardsPager, CardsSortControl } from "./board-cards/CardsToolbarControls";
import { SprintRegisterCard } from "./sprint-cards/SprintRegisterCard";
import { SprintDetailPane } from "./sprint-cards/SprintDetailPane";
import { SprintDeleteModal } from "./sprint-cards/SprintDeleteModal";

// Sprints & Plans cards mode (boards cards parity + aops-desktop sprint
// grammar): paged register of content-wide sprint/plan cards with a list
// toolbar (record filter · sort · search · expand/collapse all · mode
// controls), lazily loaded per-record detail bodies, a sticky right
// snapshot pane and sprint lifecycle (archive/delete) via the kebab.
// This file is the orchestrator; card / pane / modal live in ./sprint-cards/.

function SprintCardsFilterControl({
  filterMode,
  onSetFilterMode,
  t
}: {
  filterMode: SprintsFilterMode;
  onSetFilterMode: (mode: SprintsFilterMode) => void;
  t: TFn;
}) {
  const { open, setOpen, rootRef } = usePopover();
  const labels: Record<SprintsFilterMode, string> = {
    all: t("pmSprintCardsFilterAll"),
    sprints: t("pmSprintCardsFilterSprints"),
    plans: t("pmSprintCardsFilterPlans"),
    favorites: t("pmCardsFilterFavorites")
  };
  const notes: Record<SprintsFilterMode, string> = {
    all: t("pmSprintCardsFilterAllNote"),
    sprints: t("pmSprintCardsFilterSprintsNote"),
    plans: t("pmSprintCardsFilterPlansNote"),
    favorites: t("pmCardsFilterFavoritesNote")
  };
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
        data-testid="aops-v2-sprints-cards-filter"
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
          <span className="aops-pm-cards-popmenu-label">{t("pmSprintCardsFilterLabel")}</span>
          {SPRINT_FILTER_MODES.map((mode) => (
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

export function ProjectmanSprintCards({
  model,
  navigator,
  selectedKey,
  items,
  locale,
  t
}: {
  model: ProjectmanDataModel;
  navigator: SprintsNavigator;
  selectedKey: string | null;
  items: PlanRecordItem[];
  locale: AopsCockpitLocale;
  t: TFn;
}) {
  const projectKey = model.selectedProject?.key ?? "__global__";
  const [ui, setUi] = useState<SprintCardsUiState>(readSprintCardsUiState);
  const [query, setQuery] = useState("");
  const [paneOpen, setPaneOpen] = useState(false);
  const [page, setPage] = useState(0);

  const patchUi = useCallback((mutate: (prev: SprintCardsUiState) => SprintCardsUiState) => {
    setUi((prev) => {
      const next = mutate(prev);
      writeSprintCardsUiState(next);
      return next;
    });
  }, []);

  const favorites = useMemo(() => new Set(ui.favoritesByProject[projectKey] ?? []), [projectKey, ui.favoritesByProject]);
  const expandedKeys = useMemo(() => new Set(ui.expandedByProject[projectKey] ?? []), [projectKey, ui.expandedByProject]);
  const sortKey = ui.sortKeyByProject[projectKey] ?? "manual";
  const sortDirection = ui.sortDirectionByProject[projectKey] ?? "asc";
  const filterMode = ui.filterModeByProject[projectKey] ?? "all";
  const pageSize = ui.pageSizeByProject[projectKey] ?? DEFAULT_PAGE_SIZE;

  // Filter/search/scope changes reset the page cursor (ui-systemv2 §11).
  useEffect(() => {
    setPage(0);
  }, [projectKey, query, filterMode, sortKey, sortDirection, pageSize]);

  // Manual order (aops-desktop applyBoardOrderForProject mechanic, keyed by
  // record key so sprints and plans share one ordered register).
  const manualKeys = useMemo(() => {
    const baseKeys = items.map((item) => item.key);
    const baseSet = new Set(baseKeys);
    const stored = (ui.orderByProject[projectKey] ?? []).filter((key) => baseSet.has(key));
    const storedSet = new Set(stored);
    return [...stored, ...baseKeys.filter((key) => !storedSet.has(key))];
  }, [items, projectKey, ui.orderByProject]);

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const orderIndex = new Map(manualKeys.map((key, index) => [key, index]));
    const direction = sortDirection === "asc" ? 1 : -1;
    return items
      .filter((item) => {
        if (filterMode === "sprints" && item.kind !== "sprint") return false;
        if (filterMode === "plans" && item.kind !== "plan") return false;
        if (filterMode === "favorites" && !favorites.has(item.key)) return false;
        if (q && !`${item.name} ${item.goal ?? ""}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        const aFav = favorites.has(a.key);
        const bFav = favorites.has(b.key);
        if (aFav !== bFav) return aFav ? -1 : 1;
        if (sortKey === "manual") {
          return ((orderIndex.get(a.key) ?? 0) - (orderIndex.get(b.key) ?? 0)) * direction;
        }
        if (sortKey === "name") {
          return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }) * direction;
        }
        const aTime = Date.parse((sortKey === "updatedAt" ? a.updatedAt : a.createdAt) ?? "") || 0;
        const bTime = Date.parse((sortKey === "updatedAt" ? b.updatedAt : b.createdAt) ?? "") || 0;
        return (aTime - bTime) * direction;
      });
  }, [favorites, filterMode, items, manualKeys, query, sortDirection, sortKey]);

  const toggleFavorite = useCallback(
    (key: string) =>
      patchUi((prev) => {
        const current = prev.favoritesByProject[projectKey] ?? [];
        const next = current.includes(key) ? current.filter((id) => id !== key) : [...current, key];
        return { ...prev, favoritesByProject: { ...prev.favoritesByProject, [projectKey]: next } };
      }),
    [patchUi, projectKey]
  );
  const moveItem = useCallback(
    (key: string, direction: "up" | "down") =>
      patchUi((prev) => {
        const baseKeys = items.map((item) => item.key);
        const baseSet = new Set(baseKeys);
        const stored = (prev.orderByProject[projectKey] ?? []).filter((id) => baseSet.has(id));
        const storedSet = new Set(stored);
        const order = [...stored, ...baseKeys.filter((id) => !storedSet.has(id))];
        const index = order.indexOf(key);
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
    [items, patchUi, projectKey]
  );
  const toggleExpanded = useCallback(
    (key: string) =>
      patchUi((prev) => {
        const current = prev.expandedByProject[projectKey] ?? [];
        const next = current.includes(key) ? current.filter((id) => id !== key) : [...current, key];
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
          [projectKey]: expandAll ? items.map((item) => item.key) : []
        }
      })),
    [items, patchUi, projectKey]
  );
  const setFilterMode = useCallback(
    (mode: SprintsFilterMode) =>
      patchUi((prev) => ({
        ...prev,
        filterModeByProject: { ...prev.filterModeByProject, [projectKey]: mode }
      })),
    [patchUi, projectKey]
  );
  const setSort = useCallback(
    (key: SprintsSortKey, direction: SprintsSortDirection) =>
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
  const bodyViews = ui.bodyViewByProject[projectKey] ?? {};
  const setBodyView = useCallback(
    (key: string, patch: Partial<SprintBodyView>) =>
      patchUi((prev) => {
        const forProject = prev.bodyViewByProject[projectKey] ?? {};
        const current = forProject[key] ?? DEFAULT_SPRINT_BODY_VIEW;
        return {
          ...prev,
          bodyViewByProject: {
            ...prev.bodyViewByProject,
            [projectKey]: { ...forProject, [key]: { ...current, ...patch } }
          }
        };
      }),
    [patchUi, projectKey]
  );

  const openDetail = useCallback(
    (key: string) => {
      navigator.selectRecord(key);
      setPaneOpen(true);
    },
    [navigator]
  );

  // Sprint lifecycle writes (kebab): archive/unarchive immediate, delete via
  // confirm modal. Plans have no lifecycle ops (no kebab on plan cards).
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlanRecordItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const toggleArchive = useCallback(
    async (item: PlanRecordItem) => {
      setBusyKey(item.key);
      setActionError(null);
      try {
        if (item.archived) await unarchivePmSprint(model.client, item.id);
        else await archivePmSprint(model.client, item.id);
        model.refresh();
      } catch (error) {
        setActionError(`${t("pmCardActionFailed")}: ${apiErrorMessage(error)}`);
      } finally {
        setBusyKey(null);
      }
    },
    [model, t]
  );
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deletePmSprint(model.client, deleteTarget.id);
      setDeleteTarget(null);
      model.refresh();
    } catch (error) {
      setDeleteError(apiErrorMessage(error));
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, model]);

  const detailItem = paneOpen ? items.find((item) => item.key === selectedKey) ?? null : null;

  const pageStart = resolvePaginationState({ total: visibleItems.length, page, pageSize }).currentPage * pageSize;
  const pagedItems = visibleItems.slice(pageStart, pageStart + pageSize);

  return (
    <div className="aops-pm-cards-view" data-testid="aops-v2-sprints-cards">
      <div className="aops-pm-cards-toolbar" role="toolbar" aria-label={t("pmCardsToolbar")}>
        <div className="aops-pm-cards-toolbar-lead">
          <SprintCardsFilterControl filterMode={filterMode} onSetFilterMode={setFilterMode} t={t} />
          <CardsSortControl sortKey={sortKey} sortDirection={sortDirection} onSetSort={setSort} t={t} />
          <label className="aops-pm-cards-search">
            <span className="aops-pm-cards-search-icon" aria-hidden>
              {SearchIcon}
            </span>
            <input
              type="search"
              value={query}
              placeholder={t("pmNavSearchSprints")}
              aria-label={t("pmNavFilterSprints")}
              onChange={(event) => setQuery(event.target.value)}
              data-testid="aops-v2-sprints-cards-search"
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
      <div className={`aops-pm-cards-layout${detailItem ? " has-pane" : ""}`}>
        <div className="aops-pm-cards-list">
          {pagedItems.map((item, pageIndex) => {
            const index = pageStart + pageIndex;
            return (
              <SprintRegisterCard
                key={item.key}
                item={item}
                model={model}
                isFavorite={favorites.has(item.key)}
                isExpanded={expandedKeys.has(item.key)}
                isSelected={Boolean(detailItem && item.key === detailItem.key)}
                canMoveUp={index > 0}
                canMoveDown={index < visibleItems.length - 1}
                menuBusy={busyKey === item.key}
                bodyView={bodyViews[item.key] ?? DEFAULT_SPRINT_BODY_VIEW}
                onSetBodyView={(patch) => setBodyView(item.key, patch)}
                onToggleExpanded={() => toggleExpanded(item.key)}
                onToggleFavorite={() => toggleFavorite(item.key)}
                onMoveUp={() => moveItem(item.key, "up")}
                onMoveDown={() => moveItem(item.key, "down")}
                onOpenDetail={() => openDetail(item.key)}
                onToggleArchive={() => void toggleArchive(item)}
                onRequestDelete={() => {
                  setDeleteError(null);
                  setDeleteTarget(item);
                }}
                locale={locale}
                t={t}
              />
            );
          })}
          {visibleItems.length === 0 ? <div className="aops-pm-cards-empty">{t("pmNavNoSprints")}</div> : null}
          {visibleItems.length > 0 ? (
            <BoardsPager
              total={visibleItems.length}
              page={page}
              pageSize={pageSize}
              visibleCount={pagedItems.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              noun={t("pmSprintCardsPagerNoun")}
              testIdPrefix="aops-v2-sprints-cards"
              t={t}
            />
          ) : null}
        </div>
        {detailItem ? (
          <SprintDetailPane
            item={detailItem}
            model={model}
            onClose={() => setPaneOpen(false)}
            locale={locale}
            t={t}
          />
        ) : null}
      </div>
      {deleteTarget ? (
        <SprintDeleteModal
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
