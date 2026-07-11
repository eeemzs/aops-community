import type { ReactNode } from "react";
import type { PmTone } from "../../lib/projectman";
import { Badge } from "../../components/recordMasterDetail";
import type { ArchiveFilter, TFn } from "./types";

export function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="aops-pm-metric" role="listitem">
      <span>{value}</span>
      <b>{label}</b>
    </div>
  );
}

export function OverviewList({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="aops-pm-list-panel">
      <h3>{title}</h3>
      <div className="aops-pm-entity-list">{children}</div>
    </section>
  );
}

export function EntityRow({
  title,
  meta,
  status,
  tone
}: {
  title: string;
  meta: string;
  status: string;
  tone: PmTone;
}) {
  return (
    <div className="aops-pm-entity-row">
      <span className="aops-pm-entity-main">
        <span className="aops-pm-entity-title">{title}</span>
        <span className="aops-pm-mono">{meta}</span>
      </span>
      <Badge tone={tone}>{status}</Badge>
    </div>
  );
}

export function EmptyLine({ t }: { t: TFn }) {
  return <div className="aops-pm-empty-line">{t("pmNoRows")}</div>;
}

export function DetailRow({
  label,
  value,
  t
}: {
  label: string;
  value: string | null;
  t: TFn;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value ?? t("unknownValue")}</dd>
    </div>
  );
}

// Single Badge definition lives in the shared record surface; PM pages keep
// importing it from here.
export { Badge };

export function ArchiveSegment({
  value,
  activeCount,
  archivedCount,
  t,
  onChange
}: {
  value: ArchiveFilter;
  activeCount: number;
  archivedCount: number;
  t: TFn;
  onChange: (value: ArchiveFilter) => void;
}) {
  return (
    <SegmentedControl
      ariaLabel={t("pmArchiveFilter")}
      value={value}
      items={[
        { value: "active", label: `${t("pmFilterActive")} (${activeCount})` },
        { value: "archived", label: `${t("pmFilterArchived")} (${archivedCount})` }
      ]}
      onChange={(next) => onChange(next as ArchiveFilter)}
    />
  );
}

export function SegmentedControl({
  ariaLabel,
  value,
  items,
  onChange,
  compact = false
}: {
  ariaLabel: string;
  value: string;
  items: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  /** Small variant (per-board card toolbars). */
  compact?: boolean;
}) {
  return (
    <div className={`aops-pm-segmented${compact ? " is-compact" : ""}`} role="group" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-pressed={value === item.value}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
