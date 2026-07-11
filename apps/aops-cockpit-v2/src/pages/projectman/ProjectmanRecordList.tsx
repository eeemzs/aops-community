import type { ReactNode } from "react";
import type { PmFeedback, PmIssue, PmReviewRequest } from "@aopslab/projectman-cockpit-client";
import { type PmTone } from "../../lib/projectman";
import {
  RecordMasterDetail,
  type RecordChip,
  type RecordDetailField,
  type RecordListItem
} from "../../components/recordMasterDetail";
import type { TFn } from "./types";

// PM record builders over the shared RecordMasterDetail surface (the component
// itself lives in components/recordMasterDetail.tsx and is domain-neutral —
// the Agentspace sections reuse it).
export type { RecordChip, RecordDetailField, RecordListItem };

type NameResolver = (id?: string | null) => string | null;

function chip(label: string | null | undefined, tone?: PmTone): RecordChip[] {
  return label ? [{ label, tone }] : [];
}

export function buildIssueItems(
  issues: PmIssue[],
  sprintName: NameResolver,
  taskTitle: NameResolver,
  t: TFn
): RecordListItem[] {
  return issues.map((issue) => ({
    id: issue.id,
    title: issue.title,
    status: issue.status ?? null,
    eyebrow: t("pmSectionIssues"),
    chips: [...chip(issue.severity, toneForSeverity(issue.severity)), ...chip(issue.source)],
    fields: [
      { label: t("pmSeverity"), value: issue.severity ?? null },
      { label: t("pmSource"), value: issue.source ?? null },
      { label: t("pmFieldSprint"), value: sprintName(issue.sprintId) },
      { label: t("pmFieldLinkedTask"), value: taskTitle(issue.kanbanTaskId) }
    ],
    tags: issue.tags,
    searchText: `${issue.title} ${issue.status} ${issue.severity ?? ""} ${(issue.tags ?? []).join(" ")}`,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt
  }));
}

export function buildFeedbackItems(feedback: PmFeedback[], t: TFn): RecordListItem[] {
  return feedback.map((entry) => ({
    id: entry.id,
    title: entry.title,
    status: entry.status ?? null,
    eyebrow: t("pmSectionFeedback"),
    chips: [...chip(entry.type, "indigo"), ...chip(entry.severity, toneForSeverity(entry.severity))],
    fields: [
      { label: t("pmType"), value: entry.type ?? null },
      { label: t("pmSeverity"), value: entry.severity ?? null },
      { label: t("pmSource"), value: entry.source ?? null }
    ],
    tags: entry.tags,
    searchText: `${entry.title} ${entry.status} ${entry.type ?? ""} ${(entry.tags ?? []).join(" ")}`,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  }));
}

export function buildReviewItems(
  reviews: PmReviewRequest[],
  sprintName: NameResolver,
  taskTitle: NameResolver,
  t: TFn
): RecordListItem[] {
  return reviews.map((review) => ({
    id: review.id,
    title: review.title,
    status: review.status ?? null,
    eyebrow: t("pmSectionReviews"),
    chips: [...chip(review.priority, toneForSeverity(review.priority)), ...chip(review.source)],
    fields: [
      { label: t("pmPriority"), value: review.priority ?? null },
      { label: t("pmScope"), value: review.reviewScope ?? null },
      { label: t("pmSource"), value: review.source ?? null },
      { label: t("pmFieldSprint"), value: sprintName(review.sprintId) },
      { label: t("pmFieldLinkedTask"), value: taskTitle(review.kanbanTaskId) }
    ],
    body: [
      { heading: t("pmDescription"), text: review.description ?? "" },
      { heading: t("pmInstructions"), text: review.instructions ?? "" }
    ],
    searchText: `${review.title} ${review.status} ${review.priority ?? ""} ${review.description ?? ""}`,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    results: (review.results ?? []).map((result) => ({
      id: result.id,
      reviewer: result.reviewer,
      outcome: result.outcome,
      summary: result.summary,
      positives: result.positives,
      concerns: result.concerns,
      objections: result.objections,
      createdAt: result.createdAt
    }))
  }));
}

// Severity / priority → tone (shared across issues / feedback / reviews).
export function toneForSeverity(value?: string | null): PmTone {
  const s = (value ?? "").toLowerCase();
  if (/crit|block|urgent|p0|highest/.test(s)) return "claret";
  if (/high|major|p1/.test(s)) return "coral";
  if (/med|normal|p2/.test(s)) return "amber";
  if (/low|minor|trivial|p3/.test(s)) return "sage";
  return "ghost";
}

/** PM-labelled wrapper over the shared master-detail surface. */
export function ProjectmanRecordList({
  items,
  title,
  searchPlaceholder,
  emptyLabel,
  t
}: {
  items: RecordListItem[];
  title: string;
  searchPlaceholder: string;
  emptyLabel: string;
  t: TFn;
}): ReactNode {
  return (
    <RecordMasterDetail
      items={items}
      labels={{
        title,
        searchPlaceholder,
        emptyLabel,
        noMatchLabel: t("pmNoRows"),
        unknownStatusLabel: t("pmUnknownStatus"),
        detailAriaLabel: title,
        backLabel: t("pmCardPaneClose")
      }}
    />
  );
}
