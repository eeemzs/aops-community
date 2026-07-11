import type { ReactNode } from "react";
import { toneForStatus, shortId } from "../../../lib/projectman";
import { Badge, type RecordListItem, type RecordResultEntry } from "../../../components/recordMasterDetail";
import { formatPmDate } from "../helpers";
import { toneForSeverity } from "../ProjectmanRecordList";
import type { AopsCockpitLocale } from "../../../lib/i18n";
import type { TFn } from "../types";
import {
  BoardToggleIcon,
  DownIcon,
  FavoriteStarIcon,
  KebabIcon,
  SparkIcon,
  TrashIcon,
  UpIcon,
  usePopover
} from "../board-cards/icons";

// Embedded review results (review requests): reviewer/outcome/summary +
// positives/concerns/objections bullet groups. Shared by card body + pane.
export function RecordResults({ results, t }: { results: RecordResultEntry[]; t: TFn }) {
  if (!results.length) return null;
  return (
    <section className="aops-pm-recordcard-results">
      <h4>
        {t("pmReviewResults")} <span className="aops-pm-recordcard-results-count">{results.length}</span>
      </h4>
      {results.map((result) => (
        <article className="aops-pm-recordcard-result" key={result.id}>
          <div className="aops-pm-recordcard-result-head">
            <Badge tone={toneForStatus(result.outcome)}>{result.outcome}</Badge>
            <b>{result.reviewer}</b>
            {result.createdAt ? (
              <span className="aops-pm-muted">{result.createdAt.slice(0, 10)}</span>
            ) : null}
          </div>
          {result.summary ? <p className="aops-pm-recordcard-result-summary">{result.summary}</p> : null}
          {(
            [
              ["pmReviewPositives", result.positives],
              ["pmReviewConcerns", result.concerns],
              ["pmReviewObjections", result.objections]
            ] as const
          ).map(([key, rows]) =>
            rows && rows.length ? (
              <div className="aops-pm-recordcard-result-group" key={key}>
                <span className="aops-pm-recordcard-result-label">{t(key)}</span>
                <ul>
                  {rows.map((row) => (
                    <li key={row}>{row}</li>
                  ))}
                </ul>
              </div>
            ) : null
          )}
        </article>
      ))}
    </section>
  );
}

/** Shared expanded-body content (fields grid + text blocks + results + tags). */
export function RecordBody({ item, t }: { item: RecordListItem; t: TFn }) {
  const fields = item.fields.filter((field) => field.value);
  return (
    <>
      {fields.length ? (
        <dl className="aops-pm-recordcard-fields">
          {fields.map((field) => (
            <div key={field.label}>
              <dt>{field.label}</dt>
              <dd title={field.value ?? undefined}>{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {item.body?.map((block, index) =>
        block.text ? (
          <section className="aops-pm-recordcard-block" key={index}>
            <h5>{block.heading}</h5>
            <p>{block.text}</p>
          </section>
        ) : null
      )}
      {item.results && item.results.length ? <RecordResults results={item.results} t={t} /> : null}
      {item.tags && item.tags.length ? (
        <div className="aops-pm-recordlist-tags">
          {item.tags.map((tag) => (
            <span className="eops-chip eops-chip--ghost cp-chip-xs" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}

// Kebab: flat PM records only expose delete (no archive ops in the catalog).
function RecordCardKebab({
  busy,
  onRequestDelete,
  t
}: {
  busy: boolean;
  onRequestDelete: () => void;
  t: TFn;
}) {
  const { open, setOpen, rootRef } = usePopover();
  return (
    <div className="aops-pm-boardcard-menuwrap" ref={rootRef}>
      <button
        type="button"
        className={`aops-pm-boardcard-action${open ? " is-active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("pmCardMenu")}
        title={t("pmCardMenu")}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        data-testid="aops-v2-records-card-menu"
      >
        {KebabIcon}
      </button>
      {open ? (
        <div className="aops-pm-cards-popmenu is-right" role="menu">
          <button
            type="button"
            role="menuitem"
            className="aops-pm-cards-popmenu-option is-danger"
            onClick={() => {
              setOpen(false);
              onRequestDelete();
            }}
            data-testid="aops-v2-records-card-delete"
          >
            <span className="aops-pm-cards-popmenu-option-icon">{TrashIcon}</span>
            <span className="aops-pm-cards-popmenu-option-copy">
              <b>{t("pmRecordDelete")}</b>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

// One flat-record register card (boards/sprints chassis): head = toggle +
// title + status badge + severity/type chips; meta = dates + uid; right side
// icon actions; expanded body = fields/body/results/tags — data is already in
// the list rows, so there is no lazy fetch here.
export function RecordRegisterCard({
  item,
  isFavorite,
  isExpanded,
  isSelected,
  canMoveUp,
  canMoveDown,
  menuBusy,
  onToggleExpanded,
  onToggleFavorite,
  onMoveUp,
  onMoveDown,
  onOpenDetail,
  onRequestDelete,
  extra,
  locale,
  t
}: {
  item: RecordListItem;
  isFavorite: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  menuBusy: boolean;
  onToggleExpanded: () => void;
  onToggleFavorite: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onOpenDetail: () => void;
  /** When absent (e.g. no delete op for the section) the kebab is hidden. */
  onRequestDelete?: () => void;
  /** Section-specific expanded-body extra (detailExtra equivalent). */
  extra?: ReactNode;
  locale: AopsCockpitLocale;
  t: TFn;
}) {
  const status = (item.status ?? "").trim();
  const copyId = () => {
    try {
      void navigator.clipboard?.writeText(item.id);
    } catch {
      /* ignore */
    }
  };
  return (
    <section
      className={`aops-pm-boardcard aops-pm-recordcard${isSelected ? " is-selected" : ""}`}
      data-testid="aops-v2-records-card"
      data-record-id={item.id}
    >
      <div className="aops-pm-boardcard-head">
        <div className="aops-pm-boardcard-copy">
          <div className="aops-pm-boardcard-titlerow">
            <button
              type="button"
              className="aops-pm-boardcard-toggle"
              aria-expanded={isExpanded}
              aria-label={isExpanded ? t("pmCardCollapse") : t("pmCardExpand")}
              onClick={onToggleExpanded}
            >
              <span className="aops-pm-boardcard-symbol" aria-hidden>
                <BoardToggleIcon expanded={isExpanded} />
              </span>
              <span className="aops-pm-boardcard-title" title={item.title}>{item.title}</span>
            </button>
            <Badge tone={toneForStatus(status || null)}>{status || t("pmUnknownStatus")}</Badge>
            {item.chips.map((chipEntry) => (
              <Badge key={chipEntry.label} tone={chipEntry.tone ?? toneForSeverity(chipEntry.label)}>
                {chipEntry.label}
              </Badge>
            ))}
          </div>
          <div className="aops-pm-boardcard-meta">
            <span>
              {t("pmFieldCreated")}: {formatPmDate(item.createdAt, locale)}
            </span>
            <span>
              {t("pmFieldUpdated")}: {formatPmDate(item.updatedAt, locale)}
            </span>
            <button
              type="button"
              className="aops-pm-boardcard-uid"
              title={t("pmCardCopyId")}
              aria-label={t("pmCardCopyId")}
              onClick={copyId}
            >
              uid {shortId(item.id)}
            </button>
          </div>
        </div>
        <div className="aops-pm-boardcard-side">
          <div className="aops-pm-boardcard-actions">
            <button
              type="button"
              className="aops-pm-boardcard-action"
              aria-label={`${t("pmCardDetail")}: ${item.title}`}
              title={t("pmCardDetail")}
              onClick={onOpenDetail}
              data-testid="aops-v2-records-card-detail"
            >
              {SparkIcon}
            </button>
            <button
              type="button"
              className={`aops-pm-boardcard-action theme-accent${isFavorite ? " is-active" : ""}`}
              aria-label={isFavorite ? t("pmCardFavoriteRemove") : t("pmCardFavoriteAdd")}
              aria-pressed={isFavorite}
              title={isFavorite ? t("pmCardFavoriteRemove") : t("pmCardFavoriteAdd")}
              onClick={onToggleFavorite}
              data-testid="aops-v2-records-card-favorite"
            >
              <FavoriteStarIcon filled={isFavorite} />
            </button>
            <button
              type="button"
              className="aops-pm-boardcard-action theme-accent"
              aria-label={`${t("pmCardMoveUp")}: ${item.title}`}
              title={t("pmCardMoveUp")}
              onClick={onMoveUp}
              disabled={!canMoveUp}
              data-testid="aops-v2-records-card-moveup"
            >
              {UpIcon}
            </button>
            <button
              type="button"
              className="aops-pm-boardcard-action theme-accent"
              aria-label={`${t("pmCardMoveDown")}: ${item.title}`}
              title={t("pmCardMoveDown")}
              onClick={onMoveDown}
              disabled={!canMoveDown}
              data-testid="aops-v2-records-card-movedown"
            >
              {DownIcon}
            </button>
            {onRequestDelete ? (
              <RecordCardKebab busy={menuBusy} onRequestDelete={onRequestDelete} t={t} />
            ) : null}
          </div>
        </div>
      </div>
      {isExpanded ? (
        <div className="aops-pm-boardcard-body aops-pm-recordcard-body">
          <RecordBody item={item} t={t} />
          {extra}
        </div>
      ) : null}
    </section>
  );
}
