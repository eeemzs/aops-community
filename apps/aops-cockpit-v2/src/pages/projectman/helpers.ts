import { useMemo } from "react";
import type { AopsCockpitLocale } from "../../lib/i18n";
import {
  isArchivedPmRecord,
  isDoneStatus,
  shortId,
  type CockpitPmImplementationPlan,
  type CockpitPmImplementationPlanDetail,
  type CockpitPmMicrotask,
  type CockpitPmPhase,
  type CockpitPmSprint,
  type CockpitPmSprintDetail,
  type CockpitPmTask,
  type ProjectmanDataModel
} from "../../lib/projectman";
import type { NormalizedPlanDetail, PlanRecordItem, TFn } from "./types";

export function useColumnMap(model: ProjectmanDataModel) {
  return useMemo(() => {
    const rows = Object.values(model.columnsByBoard).flatMap((columns) => columns);
    return new Map(rows.map((column) => [column.id, column]));
  }, [model.columnsByBoard]);
}

export function sprintLabel(task: CockpitPmTask, sprintById: Map<string, CockpitPmSprint>, t: TFn): string {
  return task.sprintId ? sprintById.get(task.sprintId)?.name ?? shortId(task.sprintId) : t("pmUnassigned");
}

export function taskProgressLabel(task: CockpitPmTask): string {
  return typeof task.progress === "number" ? `${task.progress}%` : "-";
}

/** "21 Haz 02:06"-style short timestamp (chat MessageTimeline idiom). */
export function formatPmDate(value: string | undefined | null, locale: AopsCockpitLocale): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  const loc = locale === "tr" ? "tr-TR" : "en-US";
  const date = parsed.toLocaleDateString(loc, { day: "numeric", month: "short" });
  const time = parsed.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

export function detailProgressLabel(detail: NormalizedPlanDetail): string {
  const total = detail.progress?.total ?? countMicrotasks(detail.phases);
  const completed = detail.progress?.completed ?? countCompletedMicrotasks(detail.phases);
  if (total > 0) return `${completed}/${total}`;
  if (typeof detail.progress?.ratio === "number") return `${Math.round(detail.progress.ratio * 100)}%`;
  return "-";
}

/** Ordered sprint microtask status rollup (aops-desktop progressStatusChips
 *  grammar): Todo · Doing(+in_progress) · Blocked · Paused · In Review ·
 *  Postponed · Cancelled · Completed m/n. */
export interface SprintRollupChip {
  id: string;
  value: number;
  /** Completed renders as m/n; others as a plain count. */
  total?: number;
}

export function buildSprintStatusRollup(detail: NormalizedPlanDetail): SprintRollupChip[] {
  const counts = new Map<string, number>();
  for (const phase of detail.phases) {
    for (const microtask of phase.microtasks ?? []) {
      const status = (microtask.status ?? "todo").toLowerCase().replace(/-/g, "_") || "todo";
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
  }
  const total = detail.progress?.total ?? countMicrotasks(detail.phases);
  const completed = detail.progress?.completed ?? countCompletedMicrotasks(detail.phases);
  return [
    { id: "todo", value: counts.get("todo") ?? 0 },
    { id: "doing", value: (counts.get("doing") ?? 0) + (counts.get("in_progress") ?? 0) },
    { id: "blocked", value: counts.get("blocked") ?? 0 },
    { id: "paused", value: counts.get("paused") ?? 0 },
    { id: "in_review", value: counts.get("in_review") ?? 0 },
    { id: "postponed", value: counts.get("postponed") ?? 0 },
    { id: "cancelled", value: counts.get("cancelled") ?? 0 },
    { id: "completed", value: completed, total }
  ];
}

function countMicrotasks(phases: CockpitPmPhase[]): number {
  return phases.reduce((count, phase) => count + (phase.microtasks?.length ?? 0), 0);
}

function countCompletedMicrotasks(phases: CockpitPmPhase[]): number {
  return phases.reduce(
    (count, phase) => count + (phase.microtasks ?? []).filter((microtask) => isDoneStatus(microtask.status)).length,
    0
  );
}

export function planItemFromSprint(sprint: CockpitPmSprint): PlanRecordItem {
  return {
    key: `sprint:${sprint.id}`,
    id: sprint.id,
    kind: "sprint",
    name: sprint.name,
    status: sprint.status,
    goal: (sprint as { goal?: string | null }).goal,
    taskId: (sprint as { kanbanTaskId?: string | null }).kanbanTaskId,
    archived: isArchivedPmRecord(sprint),
    updatedAt: sprint.updatedAt,
    createdAt: sprint.createdAt
  };
}

export function planItemFromImplementationPlan(plan: CockpitPmImplementationPlan): PlanRecordItem {
  return {
    key: `plan:${plan.id}`,
    id: plan.id,
    kind: "plan",
    name: plan.name,
    status: (plan as { status?: string | null }).status,
    goal: (plan as { goal?: string | null }).goal,
    taskId: (plan as { kanbanTaskId?: string | null }).kanbanTaskId,
    archived: isArchivedPmRecord(plan),
    updatedAt: plan.updatedAt,
    createdAt: plan.createdAt
  };
}

export function normalizePlanDetail(
  item: PlanRecordItem,
  detail: CockpitPmSprintDetail | CockpitPmImplementationPlanDetail | undefined
): NormalizedPlanDetail {
  return {
    id: detail?.id ?? item.id,
    kind: item.kind,
    name: detail?.name ?? item.name,
    status: detail?.status ?? item.status,
    goal: detail?.goal ?? item.goal,
    taskId: detail?.kanbanTaskId ?? item.taskId,
    scope: detail?.scope ?? [],
    validationPlan: detail?.validationPlan ?? [],
    references: (detail as { references?: string[] } | undefined)?.references ?? [],
    phases: (detail?.phases ?? []).slice().sort(byPosition).map((phase) => ({
      ...phase,
      microtasks: sortedMicrotasks(phase.microtasks ?? [])
    })),
    progress: detail?.progress ?? null
  };
}

export function sortedMicrotasks(rows: CockpitPmMicrotask[]): CockpitPmMicrotask[] {
  return rows.slice().sort(byPosition);
}

export function byPosition<T extends { position?: number | null }>(a: T, b: T): number {
  return (a.position ?? 0) - (b.position ?? 0);
}

export function byRecordUpdatedDesc(
  a: { updatedAt?: string; createdAt?: string },
  b: { updatedAt?: string; createdAt?: string }
) {
  return Date.parse(b.updatedAt ?? b.createdAt ?? "") - Date.parse(a.updatedAt ?? a.createdAt ?? "");
}

/**
 * Implementation plans are a sprint-backed facade: their id is the underlying
 * sprint id, not a second record identity. Prefer the canonical sprint shape,
 * while retaining plan-only rows as a fallback when that read surface is
 * temporarily incomplete.
 */
export function buildSprintPlanItems(
  sprints: CockpitPmSprint[],
  implementationPlans: CockpitPmImplementationPlan[]
): PlanRecordItem[] {
  const bySprintId = new Map<string, PlanRecordItem>();
  for (const plan of implementationPlans) {
    bySprintId.set(plan.id, planItemFromImplementationPlan(plan));
  }
  for (const sprint of sprints) {
    bySprintId.set(sprint.id, planItemFromSprint(sprint));
  }
  return [...bySprintId.values()].sort(byRecordUpdatedDesc);
}

export function countSprintPlanRecords(
  sprints: CockpitPmSprint[],
  implementationPlans: CockpitPmImplementationPlan[]
): number {
  return new Set([...sprints, ...implementationPlans].map((record) => record.id)).size;
}

export function issueSprintId(issue: unknown): string | null {
  const value = (issue as { sprintId?: string | null }).sprintId;
  return value ?? null;
}
