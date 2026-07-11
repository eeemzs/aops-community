import { useState } from "react";
import { apiActivityIssueCount, type ApiActivityLog } from "../state/apiActivityStore";
import type { AopsCockpitTranslationKey } from "../lib/i18n";

export interface DebugPanelProps {
  open: boolean;
  logs: ApiActivityLog[];
  onClose: () => void;
  onClear: () => void;
  t: (key: AopsCockpitTranslationKey) => string;
}

/**
 * Live API activity log drawer (eops-desktop DebugPanel parity, adapted for the
 * web SPA — no Tauri auto-save, no cache filters). Reads the api-activity store;
 * opened from the footer DesktopStatusBar debug toggle.
 */
export function DebugPanel({ open, logs, onClose, onClear, t }: DebugPanelProps) {
  const [filter, setFilter] = useState<"all" | "issues">("all");

  if (!open) return null;

  const issues = apiActivityIssueCount(logs);
  const visible = filter === "issues" ? logs.filter((log) => log.level !== "info") : logs;

  return (
    <aside className="cockpit-debug-drawer" aria-label={t("debugTitle")}>
      <div className="cockpit-debug__head">
        <div>
          <p className="cockpit-debug__eyebrow">{t("debugEyebrow")}</p>
          <h3>{t("debugTitle")}</h3>
        </div>
        <div className="cockpit-debug__actions">
          <button type="button" className="aops-v2-secondary-button" onClick={onClear}>
            {t("debugClear")}
          </button>
          <button type="button" className="aops-v2-secondary-button" onClick={onClose}>
            {t("debugClose")}
          </button>
        </div>
      </div>

      <div className="cockpit-debug__stats">
        <div className="cockpit-debug__stat">
          <span>{t("debugLogs")}</span>
          <strong>{logs.length}</strong>
        </div>
        <div className="cockpit-debug__stat">
          <span>{t("debugIssues")}</span>
          <strong>{issues}</strong>
        </div>
      </div>

      <div className="cockpit-debug__filters" role="group" aria-label={t("debugTitle")}>
        <button
          type="button"
          className="eops-segmented-item"
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
        >
          {t("debugFilterAll")}
        </button>
        <button
          type="button"
          className="eops-segmented-item"
          aria-pressed={filter === "issues"}
          onClick={() => setFilter("issues")}
        >
          {t("debugFilterIssues")}
        </button>
      </div>

      <div className="cockpit-debug__list">
        {visible.length === 0 ? (
          <div className="cockpit-debug__empty">{t("debugEmpty")}</div>
        ) : (
          visible
            .slice()
            .reverse()
            .map((log) => (
              <article key={log.id} className={`cockpit-debug__log cockpit-debug__log--${log.level}`}>
                <span className="cockpit-debug__time">{formatLogTime(log.ts)}</span>
                <span className={`cockpit-debug__kind cockpit-debug__kind--${log.level}`}>{log.kind}</span>
                <span className="cockpit-debug__msg">{log.message || "-"}</span>
                {typeof log.data?.ms === "number" ? (
                  <span className="cockpit-debug__ms">{log.data.ms}ms</span>
                ) : null}
              </article>
            ))
        )}
      </div>
    </aside>
  );
}

function formatLogTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return "";
  }
}
