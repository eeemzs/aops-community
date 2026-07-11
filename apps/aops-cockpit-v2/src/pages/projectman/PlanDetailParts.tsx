import { isDoneStatus, toneForStatus, type CockpitPmPhase } from "../../lib/projectman";
import { Badge, EmptyLine } from "./components";
import { sortedMicrotasks } from "./helpers";
import type { TFn } from "./types";

export function PhaseList({
  phases,
  openPhases,
  t,
  onToggle
}: {
  phases: CockpitPmPhase[];
  openPhases: Record<string, boolean>;
  t: TFn;
  onToggle: (id: string) => void;
}) {
  if (!phases.length) return <div className="aops-pm-empty-line">{t("pmPhasesEmpty")}</div>;

  return (
    <div className="aops-pm-phase-list">
      {phases.map((phase) => {
        const rows = sortedMicrotasks(phase.microtasks ?? []);
        const done = rows.filter((microtask) => isDoneStatus(microtask.status)).length;
        const expanded = openPhases[phase.id] ?? true;
        return (
          <section className="aops-pm-phase" key={phase.id}>
            <button
              type="button"
              className="aops-pm-phase-head"
              aria-expanded={expanded}
              onClick={() => onToggle(phase.id)}
            >
              <span>{expanded ? "-" : "+"}</span>
              <b>{phase.name}</b>
              <Badge tone={done === rows.length && rows.length > 0 ? "sage" : "amber"}>
                {done}/{rows.length}
              </Badge>
            </button>
            {expanded ? (
              <div className="aops-pm-phase-body">
                {phase.description ? <p>{phase.description}</p> : null}
                {rows.map((microtask) => (
                  <div
                    className={`aops-pm-microtask${isDoneStatus(microtask.status) ? " aops-pm-microtask--done" : ""}`}
                    key={microtask.id}
                  >
                    <span className="aops-pm-microtask-state" aria-hidden="true" />
                    <span className="aops-pm-microtask-main">
                      <b>{microtask.title}</b>
                      {microtask.notes ? <small>{microtask.notes}</small> : null}
                    </span>
                    <Badge tone={toneForStatus(microtask.status)}>{microtask.status ?? "todo"}</Badge>
                  </div>
                ))}
                {rows.length === 0 ? <EmptyLine t={t} /> : null}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

export function PlanTextList({ title, rows }: { title: string; rows: string[] }) {
  return (
    <section className="aops-pm-text-list">
      <h4>{title}</h4>
      <ul>
        {rows.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
    </section>
  );
}
