import type { ReactNode } from "react";
import {
  isDoneStatus,
  toneForStatus,
  type CockpitPmMicrotask,
  type CockpitPmPhase
} from "../../lib/projectman";
import { Badge } from "./components";
import { sortedMicrotasks } from "./helpers";
import type { NormalizedPlanDetail, TFn } from "./types";

type TimelineState = "complete" | "current" | "blocked" | "upcoming" | "unplanned";

interface TimelinePhase {
  phase: CockpitPmPhase;
  microtasks: CockpitPmMicrotask[];
  ordinal: number;
  state: TimelineState;
  completed: number;
  blocked: number;
  settled: boolean;
}

const ACTIVE_STATUSES = new Set(["doing", "in_progress", "in_review", "blocked", "paused"]);
const BLOCKED_STATUSES = new Set(["blocked", "failed"]);
const TERMINAL_STATUSES = new Set(["cancelled"]);

function normalizeStatus(status?: string | null): string {
  return (status ?? "todo").trim().toLowerCase().replace(/-/g, "_") || "todo";
}

function isTerminalStatus(status?: string | null): boolean {
  return isDoneStatus(status) || TERMINAL_STATUSES.has(normalizeStatus(status));
}

function buildTimeline(phases: CockpitPmPhase[]): TimelinePhase[] {
  const rows = phases.map((phase) => {
    const microtasks = sortedMicrotasks(phase.microtasks ?? []);
    const completed = microtasks.filter((microtask) => isDoneStatus(microtask.status)).length;
    const blocked = microtasks.filter((microtask) => BLOCKED_STATUSES.has(normalizeStatus(microtask.status))).length;
    const settled = microtasks.length > 0 && microtasks.every((microtask) => isTerminalStatus(microtask.status));
    const hasActiveWork = microtasks.some((microtask) => ACTIVE_STATUSES.has(normalizeStatus(microtask.status)));
    return { phase, microtasks, completed, blocked, settled, hasActiveWork };
  });
  const explicitActiveIndex = rows.findIndex((row) => row.hasActiveWork);
  const firstOpenIndex = rows.findIndex((row) => !row.settled);
  const activeIndex = explicitActiveIndex >= 0 ? explicitActiveIndex : firstOpenIndex;
  const hasOpenPhase = rows.some((row) => !row.settled);

  return rows.map((row, index) => {
    let state: TimelineState;
    if (row.settled) state = "complete";
    else if (row.microtasks.length === 0) state = index === activeIndex && hasOpenPhase ? "current" : "unplanned";
    else if (index === activeIndex && row.blocked > 0) state = "blocked";
    else if (index === activeIndex) state = "current";
    else state = "upcoming";
    return { ...row, ordinal: index + 1, state };
  });
}

function stateLabel(state: TimelineState, t: TFn): string {
  if (state === "complete") return t("pmTimelineComplete");
  if (state === "current") return t("pmTimelineCurrent");
  if (state === "blocked") return t("pmTimelineBlocked");
  if (state === "unplanned") return t("pmTimelineUnplanned");
  return t("pmTimelineUpcoming");
}

function stateTone(state: TimelineState) {
  if (state === "complete") return "sage" as const;
  if (state === "blocked") return "claret" as const;
  if (state === "current") return "amber" as const;
  return "ghost" as const;
}

function MicrotaskStateIcon({ status }: { status?: string | null }): ReactNode {
  const normalized = normalizeStatus(status);
  const done = isDoneStatus(status);
  const blocked = BLOCKED_STATUSES.has(normalized);
  return (
    <span
      className={`aops-pm-timeline-task-icon${done ? " is-done" : ""}${blocked ? " is-blocked" : ""}`}
      aria-hidden="true"
    >
      {done ? "✓" : blocked ? "!" : ""}
    </span>
  );
}

export function SprintTimeline({
  detail,
  visiblePhases,
  compact,
  t
}: {
  detail: NormalizedPlanDetail;
  visiblePhases: CockpitPmPhase[];
  compact: boolean;
  t: TFn;
}): ReactNode {
  const timeline = buildTimeline(detail.phases);
  const visibleIds = new Set(visiblePhases.map((phase) => phase.id));
  const visibleTimeline = timeline.filter((item) => visibleIds.has(item.phase.id));
  const allMicrotasks = timeline.flatMap((item) => item.microtasks);
  const completedTasks = allMicrotasks.filter((microtask) => isDoneStatus(microtask.status)).length;
  const blockedTasks = allMicrotasks.filter((microtask) =>
    BLOCKED_STATUSES.has(normalizeStatus(microtask.status))
  ).length;
  const completedPhases = timeline.filter((item) => item.settled).length;
  const currentIndex = timeline.findIndex((item) => item.state === "current" || item.state === "blocked");
  const current = currentIndex >= 0 ? timeline[currentIndex] : null;
  const next = timeline.find((item, index) => index > currentIndex && !item.settled) ?? null;
  const canonicalRatio = detail.progress?.ratio;
  const percentage = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        typeof canonicalRatio === "number"
          ? canonicalRatio * 100
          : allMicrotasks.length > 0
            ? (completedTasks / allMicrotasks.length) * 100
            : 0
      )
    )
  );

  return (
    <section
      className={`aops-pm-timeline${compact ? " is-compact" : ""}`}
      aria-label={t("pmTimelineTitle")}
      data-testid="aops-v2-sprint-timeline"
    >
      <div className="aops-pm-timeline-overview">
        <div className="aops-pm-timeline-progress-card">
          <div className="aops-pm-timeline-progress-head">
            <span>
              <small>{t("pmTimelineEyebrow")}</small>
              <strong>{t("pmTimelineTitle")}</strong>
            </span>
            <b>{percentage}%</b>
          </div>
          <p>{t("pmTimelineSubtitle")}</p>
          <div
            className="aops-pm-timeline-progress-track"
            role="progressbar"
            aria-label={t("pmTimelineProgress")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percentage}
          >
            <span style={{ width: `${percentage}%` }} />
          </div>
          <div className="aops-pm-timeline-facts">
            <span>
              <b>{completedTasks}/{allMicrotasks.length}</b>
              {t("pmTimelineCompletedTasks")}
            </span>
            <span>
              <b>{completedPhases}/{timeline.length}</b>
              {t("pmTimelineCompletedPhases")}
            </span>
            <span className={blockedTasks > 0 ? "has-blocker" : ""}>
              <b>{blockedTasks}</b>
              {t("pmTimelineBlocked")}
            </span>
          </div>
        </div>
        <div className="aops-pm-timeline-context-card is-current">
          <span className="aops-pm-timeline-context-icon" aria-hidden="true">◎</span>
          <small>{t("pmTimelineCurrent")}</small>
          <strong>{current?.phase.name ?? t("pmTimelineFinished")}</strong>
          {current ? <span>{current.completed}/{current.microtasks.length} {t("pmTimelineTasks")}</span> : null}
        </div>
        <div className="aops-pm-timeline-context-card is-next">
          <span className="aops-pm-timeline-context-icon" aria-hidden="true">→</span>
          <small>{t("pmTimelineNext")}</small>
          <strong>{next?.phase.name ?? t("pmTimelineFinishLine")}</strong>
          {next ? <span>{next.microtasks.length} {t("pmTimelineTasks")}</span> : null}
        </div>
      </div>

      <ol className="aops-pm-timeline-list">
        {visibleTimeline.map((item) => (
          <li
            className="aops-pm-timeline-phase"
            data-state={item.state}
            key={item.phase.id}
            data-testid="aops-v2-sprint-timeline-phase"
          >
            <div className="aops-pm-timeline-rail" aria-hidden="true">
              <span>{item.state === "complete" ? "✓" : item.ordinal}</span>
            </div>
            <article className="aops-pm-timeline-phase-card">
              <header className="aops-pm-timeline-phase-head">
                <div>
                  <span className="aops-pm-timeline-step">
                    {t("pmTimelinePhase")} {String(item.ordinal).padStart(2, "0")}
                  </span>
                  <h4>{item.phase.name}</h4>
                </div>
                <Badge tone={stateTone(item.state)}>{stateLabel(item.state, t)}</Badge>
              </header>
              {item.phase.description ? <p>{item.phase.description}</p> : null}
              <div className="aops-pm-timeline-phase-progress">
                <span>
                  <i style={{ width: `${item.microtasks.length ? Math.round((item.completed / item.microtasks.length) * 100) : 0}%` }} />
                </span>
                <small>{item.completed}/{item.microtasks.length} {t("pmTimelineTasks")}</small>
              </div>
              {item.microtasks.length > 0 ? (
                <ul className="aops-pm-timeline-tasks">
                  {item.microtasks.map((microtask) => (
                    <li key={microtask.id}>
                      <MicrotaskStateIcon status={microtask.status} />
                      <span className="aops-pm-timeline-task-copy">
                        <b>{microtask.title}</b>
                        {microtask.notes ? <small>{microtask.notes}</small> : null}
                      </span>
                      <Badge tone={toneForStatus(microtask.status)}>{microtask.status ?? "todo"}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="aops-pm-timeline-no-tasks">{t("pmTimelineNoTasks")}</div>
              )}
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}
