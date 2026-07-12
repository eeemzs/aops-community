import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { WorkbenchStatePanel } from "@aopslab/xf-ui-shell-react";
import { shortId, toneForStatus, type PmTone } from "../lib/projectman";
import { useCockpitViewport } from "../lib/viewport";

// Generic searchable master-detail record surface: a list pane (search + rows)
// on the left and a record detail (eyebrow/title/chips + field grid + text
// blocks + tags) on the right. PM Issues/Feedback/Reviews and the Agentspace
// sections all render through this one component so the record grammar stays
// identical across domains. Visual grammar lives in app.css under the
// `.aops-pm-recordlist*` / `.aops-pm-rechead*` / `.aops-pm-badge*` families
// (PM named them first; they are domain-neutral).

export function Badge({ tone, children }: { tone: PmTone; children: ReactNode }) {
  return <span className={`aops-pm-badge aops-pm-badge--${tone}`}>{children}</span>;
}

export interface RecordChip {
  label: string;
  tone?: PmTone;
}

export interface RecordDetailField {
  label: string;
  value: string | null;
}

export interface RecordResultEntry {
  id: string;
  reviewer: string;
  outcome: string;
  summary: string;
  positives?: string[];
  concerns?: string[];
  objections?: string[];
  createdAt?: string;
}

export interface RecordListItem {
  id: string;
  title: string;
  status: string | null;
  chips: RecordChip[];
  fields: RecordDetailField[];
  body?: Array<{ heading: string; text: string }>;
  tags?: string[];
  eyebrow: string;
  searchText: string;
  /** Record dates (cards register sort + meta line). */
  createdAt?: string;
  updatedAt?: string;
  /** Embedded review results (review requests only). */
  results?: RecordResultEntry[];
}

export interface RecordMasterDetailLabels {
  /** Pane + empty-state title (section noun, e.g. Issues). */
  title: string;
  searchPlaceholder: string;
  /** Message when the section has no records at all. */
  emptyLabel: string;
  /** Row label when the search matches nothing. */
  noMatchLabel: string;
  /** Status badge fallback when a record has no status. */
  unknownStatusLabel: string;
  /** aria-label for the detail pane. */
  detailAriaLabel: string;
  /** Mobile fullscreen-detail return action. */
  backLabel?: string;
}

export function RecordMasterDetail({
  items,
  labels,
  toolbar,
  detailExtra,
  layout = "side-panel"
}: {
  items: RecordListItem[];
  labels: RecordMasterDetailLabels;
  /** Optional list toolbar above the search input (e.g. kind filter pills). */
  toolbar?: ReactNode;
  /** Optional extra detail content under the field grid (e.g. version body). */
  detailExtra?: (item: RecordListItem) => ReactNode;
  /** Swap the master list for a compact selector while preserving the detail pane. */
  layout?: "side-panel" | "dropdown";
}): ReactNode {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const isMobile = useCockpitViewport().viewport === "mobile";
  const detailRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const query = search.trim().toLowerCase();
  const filtered = useMemo(
    () => (query ? items.filter((item) => item.searchText.toLowerCase().includes(query)) : items),
    [items, query]
  );
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;
  const detailOpen = isMobile && selectedId !== null && filtered.some((item) => item.id === selectedId);

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!detailOpen) return undefined;
    detailRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDetail();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeDetail, detailOpen]);

  useEffect(() => {
    if (!dropdownOpen) return undefined;
    const closeDropdown = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) setDropdownOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDropdownOpen(false);
    };
    document.addEventListener("mousedown", closeDropdown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeDropdown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [dropdownOpen]);

  // With a toolbar (filter pills) an empty item set must keep the pane visible
  // so the operator can widen the filter again.
  if (items.length === 0 && !toolbar) {
    return <WorkbenchStatePanel variant="empty" title={labels.title} message={labels.emptyLabel} />;
  }

  return (
    <div
      className={`aops-pm-recordlist${layout === "dropdown" ? " is-dropdown" : ""}`}
      data-detail-open={detailOpen ? "true" : "false"}
    >
      {layout === "dropdown" ? (
        <div className="aops-pm-boardnav-dropdown aops-pm-recordlist-dropdown" ref={dropdownRef}>
          <button
            type="button"
            className="aops-pm-boardnav-trigger"
            aria-haspopup="listbox"
            aria-expanded={dropdownOpen}
            onClick={() => setDropdownOpen((open) => !open)}
          >
            <span className="aops-pm-boardnav-trigger-k">{labels.title}</span>
            <span className="aops-pm-boardnav-trigger-name">
              {selected?.title ?? labels.emptyLabel}
            </span>
            <span className="aops-pm-boardnav-caret" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 9l6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
          {dropdownOpen ? (
            <div className="aops-pm-boardnav-menu">
              <input
                className="aops-pm-boardnav-search"
                type="search"
                value={search}
                placeholder={labels.searchPlaceholder}
                aria-label={labels.searchPlaceholder}
                autoFocus
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className="aops-pm-boardnav-list" role="listbox" aria-label={labels.title}>
                {filtered.map((item) => {
                  const active = selected?.id === item.id;
                  return (
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`aops-pm-boardnav-item${active ? " is-active" : ""}`}
                      key={item.id}
                      onClick={() => {
                        setSelectedId(item.id);
                        setDropdownOpen(false);
                        setSearch("");
                      }}
                    >
                      <span className="aops-pm-boardnav-item-name">{item.title}</span>
                      <span className="aops-pm-boardnav-item-slug">{shortId(item.id)}</span>
                      {active ? <span className="aops-pm-boardnav-item-check" aria-hidden>✓</span> : null}
                    </button>
                  );
                })}
                {filtered.length === 0 ? (
                  <span className="aops-pm-boardnav-empty">{labels.noMatchLabel}</span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
      <aside className="aops-pm-recordlist-list" aria-label={labels.title}>
        {toolbar ? <div className="aops-pm-recordlist-toolbar">{toolbar}</div> : null}
        <input
          className="aops-pm-recordlist-search"
          type="text"
          value={search}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchPlaceholder}
          onChange={(event) => setSearch(event.target.value)}
        />
        <ul className="aops-pm-recordlist-rows">
          {filtered.map((item) => {
            const active = selected?.id === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`aops-pm-recordlist-row${active ? " is-active" : ""}`}
                  aria-current={active ? "true" : undefined}
                  onClick={(event) => {
                    triggerRef.current = event.currentTarget;
                    setSelectedId(item.id);
                  }}
                >
                  <span className="aops-pm-recordlist-row-title" title={item.title}>{item.title}</span>
                  <span className="aops-pm-recordlist-row-meta">
                    <Badge tone={toneForStatus(item.status)}>{item.status ?? labels.unknownStatusLabel}</Badge>
                    {item.chips.slice(0, 2).map((chip, index) => (
                      <Badge key={index} tone={chip.tone ?? "ghost"}>
                        {chip.label}
                      </Badge>
                    ))}
                  </span>
                </button>
              </li>
            );
          })}
          {filtered.length === 0 ? <li className="aops-pm-recordlist-empty">{labels.noMatchLabel}</li> : null}
        </ul>
      </aside>
      )}
      <section
        className="aops-pm-recordlist-detail"
        aria-label={labels.detailAriaLabel}
        aria-hidden={isMobile && !detailOpen ? "true" : undefined}
        ref={detailRef}
        tabIndex={detailOpen ? -1 : undefined}
      >
        {selected ? (
          <>
            <header className="aops-pm-rechead">
              <button
                type="button"
                className="aops-pm-recordlist-mobile-back"
                onClick={closeDetail}
                aria-label={labels.backLabel ?? labels.title}
              >
                <span aria-hidden>←</span>
                {labels.backLabel ?? labels.title}
              </button>
              <div className="aops-pm-rechead-id">
                <span className="aops-pm-rechead-eyebrow">{selected.eyebrow}</span>
                <h3 className="aops-pm-rechead-title" title={selected.title}>{selected.title}</h3>
                <div className="aops-pm-rechead-meta">
                  <Badge tone={toneForStatus(selected.status)}>
                    {selected.status ?? labels.unknownStatusLabel}
                  </Badge>
                  {selected.chips.map((chip, index) => (
                    <Badge key={index} tone={chip.tone ?? "ghost"}>
                      {chip.label}
                    </Badge>
                  ))}
                  <span className="aops-pm-mono">{shortId(selected.id)}</span>
                </div>
              </div>
            </header>
            <dl className="aops-pm-detail-grid">
              {selected.fields
                .filter((field) => field.value)
                .map((field, index) => (
                  <div className="aops-pm-detail-row" key={index}>
                    <dt>{field.label}</dt>
                    <dd title={field.value ?? undefined}>{field.value}</dd>
                  </div>
                ))}
            </dl>
            {selected.body?.map((block, index) =>
              block.text ? (
                <section className="aops-pm-recordlist-block" key={index}>
                  <h5>{block.heading}</h5>
                  <p>{block.text}</p>
                </section>
              ) : null
            )}
            {detailExtra ? detailExtra(selected) : null}
            {selected.tags && selected.tags.length ? (
              <div className="aops-pm-recordlist-tags">
                {selected.tags.map((tag) => (
                  <span className="eops-chip eops-chip--ghost cp-chip-xs" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <WorkbenchStatePanel variant="empty" title={labels.title} message={labels.noMatchLabel} />
        )}
      </section>
    </div>
  );
}
