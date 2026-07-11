import type { ReactNode } from "react";
import { toneForStatus, shortId } from "../../../lib/projectman";
import { Badge, type RecordListItem } from "../../../components/recordMasterDetail";
import { formatPmDate } from "../helpers";
import { toneForSeverity } from "../ProjectmanRecordList";
import type { AopsCockpitLocale } from "../../../lib/i18n";
import type { TFn } from "../types";
import { CloseIcon } from "../board-cards/icons";
import { RecordBody } from "./RecordCard";

// Sticky right detail pane (ui-systemv2 §11.2) for flat PM records: identity
// chips + the shared record body (fields/blocks/results/tags) + dates.
export function RecordPane({
  item,
  sectionTitle,
  onClose,
  extra,
  locale,
  t
}: {
  item: RecordListItem;
  sectionTitle: string;
  onClose: () => void;
  /** Section-specific extra body (detailExtra equivalent). */
  extra?: ReactNode;
  locale: AopsCockpitLocale;
  t: TFn;
}) {
  const status = (item.status ?? "").trim();
  return (
    <aside className="aops-pm-cardpane" aria-label={sectionTitle} data-testid="aops-v2-records-cardpane">
      <header className="aops-pm-cardpane-head">
        <div className="aops-pm-cardpane-heading">
          <span className="aops-pm-board-eyebrow">{sectionTitle}</span>
          <h3 className="aops-pm-cardpane-title" title={item.title}>{item.title}</h3>
        </div>
        <button
          type="button"
          className="aops-pm-boardcard-action aops-pm-recordpane-close"
          aria-label={t("pmCardPaneClose")}
          title={t("pmCardPaneClose")}
          onClick={onClose}
          data-testid="aops-v2-records-cardpane-close"
        >
          <span className="aops-pm-recordpane-close-mobile" aria-hidden>← {t("pmCardPaneClose")}</span>
          <span className="aops-pm-recordpane-close-desktop" aria-hidden>{CloseIcon}</span>
        </button>
      </header>
      <div className="aops-pm-cardpane-body">
        <div className="aops-pm-cardpane-chips">
          <Badge tone={toneForStatus(status || null)}>{status || t("pmUnknownStatus")}</Badge>
          {item.chips.map((chipEntry) => (
            <Badge key={chipEntry.label} tone={chipEntry.tone ?? toneForSeverity(chipEntry.label)}>
              {chipEntry.label}
            </Badge>
          ))}
          <span className="aops-pm-mono">uid {shortId(item.id)}</span>
        </div>
        <RecordBody item={item} t={t} />
        {extra}
        <dl className="aops-pm-cardpane-dates">
          <div>
            <dt>{t("pmFieldCreated")}</dt>
            <dd>{formatPmDate(item.createdAt, locale)}</dd>
          </div>
          <div>
            <dt>{t("pmFieldUpdated")}</dt>
            <dd>{formatPmDate(item.updatedAt, locale)}</dd>
          </div>
        </dl>
      </div>
    </aside>
  );
}
