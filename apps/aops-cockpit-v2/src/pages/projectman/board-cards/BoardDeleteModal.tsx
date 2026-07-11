import { useEffect } from "react";
import type { CockpitPmBoard } from "../../../lib/projectman";
import type { TFn } from "../types";

// Delete confirm (aops-desktop parity: board name + danger button, no typed-
// name gate) + an explicit orphan warning the desktop modal lacks: the server
// delete has no cascade, so linked tasks/column links stay in the DB dangling.
export function BoardDeleteModal({
  board,
  taskCount,
  columnCount,
  busy,
  error,
  onCancel,
  onConfirm,
  t
}: {
  board: CockpitPmBoard;
  /** null = tasks never loaded for this board (count unknown). */
  taskCount: number | null;
  columnCount: number;
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

  const countsKnown = taskCount !== null;
  const hasDeps = !countsKnown || (taskCount ?? 0) > 0 || columnCount > 0;
  const warn = countsKnown
    ? t("pmCardDeleteWarnOrphans")
        .replace("{tasks}", String(taskCount))
        .replace("{columns}", String(columnCount))
    : t("pmCardDeleteWarnOrphansUnknown");

  return (
    <div className="aops-v2-chat-modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="aops-v2-chat-modal aops-v2-chat-modal-sm"
        role="dialog"
        aria-modal="true"
        aria-label={t("pmCardDeleteTitle")}
        onClick={(event) => event.stopPropagation()}
        data-testid="aops-v2-boards-delete-modal"
      >
        <header className="aops-v2-chat-modal-head">
          <h4>{t("pmCardDeleteTitle")}</h4>
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
            {t("pmCardDeleteBoardLabel")}: <b>{board.name}</b>
            {board.slug ? <span className="aops-pm-mono"> ({board.slug})</span> : null}
          </p>
          <p className="aops-v2-chat-muted">{t("pmCardDeleteQuestion")}</p>
          <p className={`aops-pm-delete-warn${hasDeps ? " has-deps" : ""}`}>
            {hasDeps ? warn : t("pmCardDeleteNoDeps")}
          </p>
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
              data-testid="aops-v2-boards-delete-confirm"
            >
              {busy ? t("pmCardDeleteBusy") : t("pmCardDeleteConfirm")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
