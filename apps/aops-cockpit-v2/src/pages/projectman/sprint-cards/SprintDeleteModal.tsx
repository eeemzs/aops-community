import { useEffect } from "react";
import type { PlanRecordItem, TFn } from "../types";

// Sprint delete confirm (aops-desktop parity: name + danger button, no typed-
// name gate) + an explicit dependents note: phases/checklist go with the
// sprint document, the linked kanban task does NOT.
export function SprintDeleteModal({
  item,
  busy,
  error,
  onCancel,
  onConfirm,
  t
}: {
  item: PlanRecordItem;
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
        aria-label={t("pmSprintDeleteTitle")}
        onClick={(event) => event.stopPropagation()}
        data-testid="aops-v2-sprints-delete-modal"
      >
        <header className="aops-v2-chat-modal-head">
          <h4>{t("pmSprintDeleteTitle")}</h4>
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
            {t("pmSprintDeleteLabel")}: <b>{item.name}</b>
          </p>
          <p className="aops-v2-chat-muted">{t("pmSprintDeleteQuestion")}</p>
          <p className="aops-pm-delete-warn has-deps">{t("pmSprintDeleteWarn")}</p>
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
              data-testid="aops-v2-sprints-delete-confirm"
            >
              {busy ? t("pmCardDeleteBusy") : t("pmSprintDeleteConfirm")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
