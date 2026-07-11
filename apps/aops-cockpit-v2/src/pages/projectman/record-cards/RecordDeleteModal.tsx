import { useEffect } from "react";
import type { RecordListItem } from "../../../components/recordMasterDetail";
import type { TFn } from "../types";

// Generic flat-record delete confirm (desktop parity: name + danger button):
// embedded content (e.g. review results) goes with the record, linked
// sprint/task records do NOT.
export function RecordDeleteModal({
  item,
  busy,
  error,
  onCancel,
  onConfirm,
  t
}: {
  item: RecordListItem;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  t: TFn;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="aops-v2-chat-modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="aops-v2-chat-modal aops-v2-chat-modal-sm"
        role="dialog"
        aria-modal="true"
        aria-label={t("pmRecordDeleteTitle")}
        onClick={(event) => event.stopPropagation()}
        data-testid="aops-v2-records-delete-modal"
      >
        <header className="aops-v2-chat-modal-head">
          <h4>{t("pmRecordDeleteTitle")}</h4>
          <button
            type="button"
            className="aops-v2-chat-iconclose"
            aria-label={t("pmCardCancel")}
            onClick={onCancel}
          >
            ✕
          </button>
        </header>
        <div className="aops-v2-chat-modal-body">
          <p className="aops-pm-delete-board-line">
            {t("pmRecordDeleteLabel")}: <b>{item.title}</b>
          </p>
          <p className="aops-v2-chat-muted">{t("pmRecordDeleteQuestion")}</p>
          <p className="aops-pm-delete-warn has-deps">{t("pmRecordDeleteWarn")}</p>
          {error ? <p className="aops-pm-delete-error">{error}</p> : null}
          <div className="aops-pm-delete-actions">
            <button type="button" className="aops-pm-cards-mini" onClick={onCancel} disabled={busy}>
              {t("pmCardCancel")}
            </button>
            <button
              type="button"
              className="aops-v2-chat-danger-button"
              disabled={busy}
              onClick={onConfirm}
              data-testid="aops-v2-records-delete-confirm"
            >
              {busy ? t("pmCardDeleteBusy") : t("pmRecordDeleteConfirm")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
