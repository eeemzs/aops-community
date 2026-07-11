import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { WorkbenchSectionShell, WorkbenchStatePanel } from "@aopslab/xf-ui-shell-react";
import { apiErrorMessage } from "../lib/aopsApi";
import {
  AGENTSPACE_SECTIONS,
  agentspacePageIdForSection,
  type AgentspaceSectionId
} from "../lib/sections";
import { MarkdownLite } from "../components/MarkdownLite";
import { shortId, type PmTone } from "../lib/projectman";
import {
  useAgentspaceAssetVersion,
  useAgentspaceDiscussionDetail,
  type AgentspaceAgentProfile,
  type AgentspaceArtifact,
  type AgentspaceDataModel,
  type AgentspaceDiscussionOutput,
  type AgentspaceDiscussionTopic,
  type AgentspaceMemoryItem,
  type AgentspaceMission,
  type AgentspacePrompt,
  type AgentspaceResource,
  type AgentspaceSkill
} from "../lib/agentspace";
import { RecordMasterDetail, type RecordListItem } from "../components/recordMasterDetail";
import { RecordSectionHost } from "./projectman/record-cards/RecordSectionHost";
import { CloseIcon } from "./projectman/board-cards/icons";
import { SegmentedControl } from "./projectman/components";
import { formatPmDate } from "./projectman/helpers";
import type { AopsCockpitLocale, AopsCockpitTranslationKey } from "../lib/i18n";
import type { ProjectmanRefKind, ProjectmanRefTarget } from "../lib/projectmanRefs";
import { useCockpitViewport } from "../lib/viewport";

type TFn = (key: AopsCockpitTranslationKey) => string;
type MemoryViewMode = "timeline" | "cards" | "read" | "digest";
type MemorySortKey = "updated" | "created" | "kind" | "importance" | "status" | "title";

interface AgentspacePmRef extends ProjectmanRefTarget {
  label: string;
  rawType?: string | null;
}

type AgentspaceRecordItem = RecordListItem & {
  refs?: AgentspacePmRef[];
};

interface MemoryViewerUiState {
  viewByScope: Record<string, MemoryViewMode>;
  expandedByScope: Record<string, string[]>;
  sortByScope: Record<string, MemorySortKey>;
}

const MEMORY_VIEWER_UI_STORAGE_KEY = "aops-cockpit-v2.agentspace.memoryViewer";
const AGENTSPACE_CARD_PAGE_SIZE = 30;
const AGENTSPACE_DIGEST_INITIAL_ROWS = 3;
const AGENTSPACE_DIGEST_PAGE_SIZE = 6;
const EMPTY_MEMORY_VIEWER_UI_STATE: MemoryViewerUiState = {
  viewByScope: {},
  expandedByScope: {},
  sortByScope: {}
};

function readMemoryViewerUiState(): MemoryViewerUiState {
  if (typeof window === "undefined") return EMPTY_MEMORY_VIEWER_UI_STATE;
  try {
    const raw = window.localStorage.getItem(MEMORY_VIEWER_UI_STORAGE_KEY);
    if (!raw) return EMPTY_MEMORY_VIEWER_UI_STATE;
    const parsed = JSON.parse(raw) as Partial<MemoryViewerUiState>;
    return { ...EMPTY_MEMORY_VIEWER_UI_STATE, ...parsed };
  } catch {
    return EMPTY_MEMORY_VIEWER_UI_STATE;
  }
}

function writeMemoryViewerUiState(state: MemoryViewerUiState): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MEMORY_VIEWER_UI_STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    /* ignore persistence failures */
  }
}

function patchMemoryViewerUiState(
  setUi: (value: (prev: MemoryViewerUiState) => MemoryViewerUiState) => void,
  mutate: (prev: MemoryViewerUiState) => MemoryViewerUiState
): void {
  setUi((prev) => {
    const next = mutate(prev);
    writeMemoryViewerUiState(next);
    return next;
  });
}

// Agentspace A2 multi-tab dispatcher (PM dispatcher grammar): the project band
// lives in the shell thin-bar; this page owns the section tabs (Memory /
// Missions / Discussions / Prompts / Skills / Resources / Agents) + the active
// section body, synced with the two-level left menu via the routed page id.
// S2.1 renders every section through the shared RecordMasterDetail; S2.2-S2.5
// deepen individual sections (filters, version bodies, turn threads).
export function AgentspacePage({
  model,
  section,
  onNavigate,
  onOpenPlan,
  onOpenProjectmanRef,
  locale,
  t
}: {
  model: AgentspaceDataModel;
  section: AgentspaceSectionId;
  onNavigate: (pageId: string) => void;
  /** Jump to PM ▸ Sprints with the given sprint/plan id selected. */
  onOpenPlan: (planId: string) => void;
  onOpenProjectmanRef: (target: ProjectmanRefTarget) => void;
  locale: AopsCockpitLocale;
  t: TFn;
}): ReactNode {
  const sectionCounts: Record<AgentspaceSectionId, number> = {
    memory: model.memoryItems.length,
    missions: model.missions.length,
    discussions: model.discussions.length,
    prompts: model.prompts.length,
    skills: model.skills.length,
    artifacts: model.artifacts.length,
    resources: model.resources.length,
    agents: model.agentProfiles.length
  };
  const tabs = AGENTSPACE_SECTIONS.map((entry) => ({
    id: entry.section,
    label: t(entry.labelKey),
    count: sectionCounts[entry.section] || null
  }));
  const projectKey = model.selectedProject?.key ?? "__global__";
  const recordScopeKey = `${projectKey}:as-${section}`;
  const hasMultiView = section === "memory" || section === "missions" || section === "discussions";
  const hasTimelineView = section === "memory";
  const isMobile = useCockpitViewport().viewport === "mobile";
  const [memoryUi, setMemoryUi] = useState<MemoryViewerUiState>(readMemoryViewerUiState);
  const rawRecordViewMode = memoryUi.viewByScope[recordScopeKey];
  const preferredRecordViewMode =
    rawRecordViewMode === "timeline" && !hasTimelineView
      ? "cards"
      : rawRecordViewMode ?? (hasTimelineView ? "timeline" : "cards");
  const recordViewMode = isMobile ? "cards" : preferredRecordViewMode;
  const setRecordViewMode = (mode: MemoryViewMode) =>
    patchMemoryViewerUiState(setMemoryUi, (prev) => ({
      ...prev,
      viewByScope: { ...prev.viewByScope, [recordScopeKey]: mode }
    }));

  return (
    <WorkbenchSectionShell className="aops-v2-section aops-pm-section" mainClassName="aops-v2-section-main">
      <div className="aops-pm-dispatch">
        <label className="aops-pm-mobile-section-picker">
          <span>{t("asTitle")}</span>
          <select
            aria-label={t("asTitle")}
            value={section}
            onChange={(event) => onNavigate(agentspacePageIdForSection(event.target.value as AgentspaceSectionId))}
          >
            {tabs.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.label}{tab.count != null ? ` (${tab.count})` : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="aops-pm-sectiontabs" role="tablist" aria-label={t("asTitle")}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={section === tab.id}
              className={`aops-pm-sectiontab${section === tab.id ? " is-active" : ""}`}
              onClick={() => onNavigate(agentspacePageIdForSection(tab.id))}
            >
              <span className="aops-pm-sectiontab-label">{tab.label}</span>
              {tab.count != null ? <span className="aops-pm-sectiontab-count">{tab.count}</span> : null}
            </button>
          ))}
          {hasMultiView ? (
            <MemoryViewSwitch value={recordViewMode} includeTimeline={hasTimelineView} onChange={setRecordViewMode} t={t} />
          ) : null}
        </div>
        <div className="aops-pm-dispatch-body">
          <AgentspaceSectionBody
            section={section}
            model={model}
            onOpenPlan={onOpenPlan}
            onOpenProjectmanRef={onOpenProjectmanRef}
            locale={locale}
            t={t}
            projectKey={projectKey}
            recordScopeKey={recordScopeKey}
            memoryUi={memoryUi}
            setMemoryUi={setMemoryUi}
            recordViewMode={recordViewMode}
          />
        </div>
      </div>
    </WorkbenchSectionShell>
  );
}

function AgentspaceSectionBody({
  section,
  model,
  onOpenPlan,
  onOpenProjectmanRef,
  locale,
  t,
  projectKey,
  recordScopeKey,
  memoryUi,
  setMemoryUi,
  recordViewMode
}: {
  section: AgentspaceSectionId;
  model: AgentspaceDataModel;
  onOpenPlan: (planId: string) => void;
  onOpenProjectmanRef: (target: ProjectmanRefTarget) => void;
  locale: AopsCockpitLocale;
  t: TFn;
  projectKey: string;
  recordScopeKey: string;
  memoryUi: MemoryViewerUiState;
  setMemoryUi: (value: (prev: MemoryViewerUiState) => MemoryViewerUiState) => void;
  recordViewMode: MemoryViewMode;
}): ReactNode {
  const sectionDef = AGENTSPACE_SECTIONS.find((entry) => entry.section === section) ?? AGENTSPACE_SECTIONS[0];
  const labels = (searchKey: AopsCockpitTranslationKey) => ({
    title: t(sectionDef.labelKey),
    searchPlaceholder: t(searchKey),
    emptyLabel: t("asNoRecords"),
    noMatchLabel: t("asNoRecords"),
    unknownStatusLabel: t("pmUnknownStatus"),
    detailAriaLabel: t(sectionDef.labelKey),
    backLabel: t("pmCardPaneClose")
  });
  // Cards | List host wrapper (record-cards registry): shared by every
  // Agentspace section; the legacy master-detail element stays the List view.
  const host = (
    searchKey: AopsCockpitTranslationKey,
    items: AgentspaceRecordItem[],
    options?: {
      renderExtra?: (item: AgentspaceRecordItem) => ReactNode;
      toolbarExtra?: ReactNode;
      listNode?: ReactNode;
    }
  ) => {
    const renderExtra = (item: RecordListItem) => (
      <>
        <AgentspaceRefButtons refs={(item as AgentspaceRecordItem).refs} onOpen={onOpenProjectmanRef} t={t} />
        {options?.renderExtra?.(item as AgentspaceRecordItem)}
      </>
    );
    return (
    <RecordSectionHost
      section={`as-${section}`}
      projectKey={projectKey}
      items={items}
      title={t(sectionDef.labelKey)}
      searchPlaceholder={t(searchKey)}
      emptyLabel={t("asNoRecords")}
      renderExtra={renderExtra}
      toolbarExtra={options?.toolbarExtra}
      locale={locale}
      t={t}
      listNode={
        options?.listNode ?? (
          <RecordMasterDetail
            items={items}
            labels={labels(searchKey)}
            detailExtra={renderExtra}
          />
        )
      }
    />
    );
  };

  if (model.status === "select-project") {
    return <WorkbenchStatePanel variant="empty" title={t("asNoProjectTitle")} message={t("asNoProjectMessage")} />;
  }

  // Artifacts loads independently of the 7 core Agentspace sections, so it owns
  // its full pending/error/data lifecycle here and must not be shadowed by the
  // aggregate loading/error/empty gates that describe those core sections — an
  // artifacts-only project or an artifacts-only backend gap stays visible
  // (codex RRR: issue a02ca283).
  if (section === "artifacts") {
    if (model.artifactsPending) {
      return <WorkbenchStatePanel variant="loading" title={t("asLoadingTitle")} message={t("asLoadingMessage")} />;
    }
    if (model.artifactsError) {
      return (
        <WorkbenchStatePanel
          variant="error"
          title={t("asArtifactsGapTitle")}
          message={`${t("asArtifactsGapMessage")} — ${apiErrorMessage(model.artifactsError, "agentspace_operation_failed")}`}
          actions={
            <button type="button" className="aops-v2-secondary-button" onClick={model.refresh}>
              {t("authRetry")}
            </button>
          }
        />
      );
    }
    return host("asSearchArtifacts", buildArtifactItems(model.artifacts, locale, t));
  }

  if (model.status === "loading") {
    return <WorkbenchStatePanel variant="loading" title={t("asLoadingTitle")} message={t("asLoadingMessage")} />;
  }
  if (model.status === "error") {
    return (
      <WorkbenchStatePanel
        variant="error"
        title={t("asErrorTitle")}
        message={apiErrorMessage(model.error, "agentspace_unavailable")}
        actions={
          <button type="button" className="aops-v2-secondary-button" onClick={model.refresh}>
            {t("authRetry")}
          </button>
        }
      />
    );
  }
  if (model.status === "empty") {
    return <WorkbenchStatePanel variant="empty" title={t("asEmptyTitle")} message={t("asEmptyMessage")} />;
  }

  if (section === "memory") {
    return (
      <MemorySection
        model={model}
        scopeKey={recordScopeKey}
        ui={memoryUi}
        setUi={setMemoryUi}
        viewMode={recordViewMode}
        onOpenProjectmanRef={onOpenProjectmanRef}
        locale={locale}
        t={t}
      />
    );
  }
  if (section === "missions") {
    const missionPlanAction = (item: AgentspaceRecordItem) => {
      const mission = model.missions.find((row) => row.id === item.id);
      const planId = mission?.activeImplementationPlanRef?.refId;
      return planId ? (
        <div className="aops-pm-recordlist-actions">
          <button type="button" className="aops-v2-secondary-button" onClick={() => onOpenPlan(planId)}>
            {t("asOpenPlanInPm")}
          </button>
        </div>
      ) : null;
    };
    return (
      <AgentspaceRecordSection
        title={t("asSectionMissions")}
        searchLabel={t("asSearchMissions")}
        emptyLabel={t("asNoRecords")}
        items={buildMissionItems(model.missions, t)}
        scopeKey={recordScopeKey}
        ui={memoryUi}
        setUi={setMemoryUi}
        viewMode={recordViewMode}
        locale={locale}
        t={t}
        onOpenProjectmanRef={onOpenProjectmanRef}
        cardDetailExtra={missionPlanAction}
        detailExtra={missionPlanAction}
      />
    );
  }
  if (section === "discussions") {
    return (
      <AgentspaceRecordSection
        title={t("asSectionDiscussions")}
        searchLabel={t("asSearchDiscussions")}
        emptyLabel={t("asNoRecords")}
        items={buildDiscussionItems(model.discussions, locale, t)}
        scopeKey={recordScopeKey}
        ui={memoryUi}
        setUi={setMemoryUi}
        viewMode={recordViewMode}
        locale={locale}
        t={t}
        onOpenProjectmanRef={onOpenProjectmanRef}
        detailExtra={(item) => <DiscussionThread model={model} topicId={item.id} locale={locale} t={t} />}
      />
    );
  }
  if (section === "prompts") {
    return host("asSearchPrompts", buildAssetItems(model.prompts, "prompts", locale, t), {
      renderExtra: (item) => {
        const versionId = model.prompts.find((row) => row.id === item.id)?.currentVersionId ?? null;
        return <AssetVersionBody model={model} asset="prompt" versionId={versionId} t={t} />;
      }
    });
  }
  if (section === "skills") {
    return host("asSearchSkills", buildAssetItems(model.skills, "skills", locale, t), {
      renderExtra: (item) => {
        const versionId = model.skills.find((row) => row.id === item.id)?.currentVersionId ?? null;
        return <AssetVersionBody model={model} asset="skill" versionId={versionId} t={t} />;
      }
    });
  }
  if (section === "resources") {
    return host("asSearchResources", buildResourceItems(model.resources, locale, t));
  }
  return host("asSearchAgents", buildAgentItems(model.agentProfiles, t));
}

function MemoryViewSwitch({
  value,
  includeTimeline,
  onChange,
  t
}: {
  value: MemoryViewMode;
  includeTimeline: boolean;
  onChange: (value: MemoryViewMode) => void;
  t: TFn;
}): ReactNode {
  const items = [
    ...(includeTimeline ? [{ value: "timeline", label: t("asMemoryViewTimeline") }] : []),
    { value: "cards", label: t("asMemoryViewCards") },
    { value: "read", label: t("asMemoryViewRead") },
    { value: "digest", label: t("asMemoryViewDigest") }
  ];
  return (
    <div className="aops-as-memory-view-switch">
      <span className="aops-as-memory-eyebrow">{t("asMemoryViewLabel")}</span>
      <SegmentedControl
        compact
        ariaLabel={t("asMemoryViewLabel")}
        value={value}
        items={items}
        onChange={(next) => onChange(next as MemoryViewMode)}
      />
    </div>
  );
}

const MEMORY_KIND_COLORS: Record<string, string> = {
  resume: "#4A6B91",
  checkpoint: "#E89A4A",
  closeout: "#5B8B6F",
  note: "#D2C2A4",
  kickoff: "#D97757",
  rule: "#C26041",
  decision: "#6D5F8F",
  constraint: "#B3503C"
};

function memoryKindColor(kind: string | null | undefined): string {
  return MEMORY_KIND_COLORS[(kind ?? "").toLowerCase()] ?? "#D2C2A4";
}

const DISCUSSION_KIND_COLORS: Record<string, string> = {
  proposal: "var(--aops-v2-primary)",
  question: "var(--amber, var(--aops-v2-primary))",
  answer: "var(--sage, var(--aops-v2-primary))",
  statement: "var(--aops-v2-muted)",
  "final-stance": "var(--coral, var(--aops-v2-primary))",
  objection: "var(--coral, var(--aops-v2-primary))",
  concession: "var(--sage, var(--aops-v2-primary))"
};

function discussionKindColor(kind: string | null | undefined): string {
  return DISCUSSION_KIND_COLORS[(kind ?? "").toLowerCase()] ?? "var(--aops-v2-primary)";
}

function discussionKindChipClass(kind: string | null | undefined): string {
  switch ((kind ?? "").toLowerCase()) {
    case "final-stance":
    case "objection":
      return "eops-chip--coral";
    case "answer":
    case "concession":
      return "eops-chip--sage";
    case "question":
      return "eops-chip--amber";
    default:
      return "eops-chip--ghost";
  }
}

const DISCUSSION_OUTPUT_KIND_ORDER = ["decision", "consensus", "disagreement", "open-questions", "final-stance"];
const DISCUSSION_OUTPUT_KIND_TONES: Record<string, PmTone> = {
  decision: "sage",
  consensus: "sage",
  disagreement: "coral",
  "open-questions": "amber",
  "final-stance": "coral"
};

function normalizedDiscussionOutputKind(kind: string | null | undefined): string {
  return (kind ?? "").trim().toLowerCase();
}

function discussionOutputTone(kind: string | null | undefined): PmTone {
  return DISCUSSION_OUTPUT_KIND_TONES[normalizedDiscussionOutputKind(kind)] ?? "ghost";
}

function discussionOutputChipClass(kind: string | null | undefined): string {
  return `eops-chip--${discussionOutputTone(kind)}`;
}

function discussionOutputKindLabel(kind: string | null | undefined, t: TFn): string {
  switch (normalizedDiscussionOutputKind(kind)) {
    case "decision":
      return t("asOutputKindDecision");
    case "consensus":
      return t("asOutputKindConsensus");
    case "disagreement":
      return t("asOutputKindDisagreement");
    case "open-questions":
      return t("asOutputKindOpenQuestions");
    case "final-stance":
      return t("asOutputKindFinalStance");
    default:
      return kind ?? t("asOutputs");
  }
}

function sortDiscussionOutputs(outputs: AgentspaceDiscussionOutput[]): AgentspaceDiscussionOutput[] {
  return outputs
    .map((output, index) => ({ output, index }))
    .sort((left, right) => {
      const leftOrder = DISCUSSION_OUTPUT_KIND_ORDER.indexOf(normalizedDiscussionOutputKind(left.output.outputKind));
      const rightOrder = DISCUSSION_OUTPUT_KIND_ORDER.indexOf(normalizedDiscussionOutputKind(right.output.outputKind));
      const leftRank = leftOrder === -1 ? Number.MAX_SAFE_INTEGER : leftOrder;
      const rightRank = rightOrder === -1 ? Number.MAX_SAFE_INTEGER : rightOrder;
      return leftRank - rightRank || left.index - right.index;
    })
    .map((entry) => entry.output);
}

function discussionBlockedAttention(row: Pick<AgentspaceDiscussionTopic, "blockedOn" | "blockingTurnSeq">, t: TFn): string | null {
  if (!row.blockedOn) return null;
  const turn = row.blockingTurnSeq != null ? ` #${row.blockingTurnSeq}` : "";
  return `${t("asAttentionBlocked")}: ${row.blockedOn}${turn}`;
}

function memorySearchText(row: AgentspaceMemoryItem): string {
  return [
    row.content,
    row.kind,
    row.durability,
    row.sourceType,
    row.sourceId,
    JSON.stringify(row.meta ?? {}),
    ...(row.tags ?? [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function sourceText(row: AgentspaceMemoryItem): string | null {
  if (!row.sourceType && !row.sourceId) return null;
  return `${row.sourceType ?? "source"}${row.sourceId ? ` · ${shortId(row.sourceId)}` : ""}`;
}

function memoryScope(row: AgentspaceMemoryItem | null | undefined): string | null {
  const meta = row?.meta;
  if (!meta || typeof meta !== "object") return null;
  const value = meta.scopeId ?? meta.projectId ?? meta.projectSlug;
  return typeof value === "string" && value.trim() ? value : null;
}

function memoryTitle(row: AgentspaceMemoryItem): string {
  return firstLine(row.content, 132) || shortId(row.id);
}

function memoryContentParts(row: AgentspaceMemoryItem): { title: string | null; body: string } {
  const content = (row.content ?? "").trim();
  if (!content) return { title: null, body: "" };
  const lines = content.split(/\r?\n/);
  const title = (lines[0] ?? "").trim();
  const body = lines.slice(1).join("\n").trim();
  return body ? { title, body } : { title: null, body: content };
}

function metaString(meta: Record<string, unknown> | null | undefined, ...keys: string[]): string | null {
  if (!meta || typeof meta !== "object") return null;
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function normalizePmRefKind(refType: string | null | undefined): ProjectmanRefKind | null {
  const key = (refType ?? "").toLowerCase();
  if (!key) return null;
  if (key.includes("board")) return "board";
  if (key.includes("sprint") || key.includes("implementation-plan") || key.includes("implementation_plan") || key.includes("plan")) {
    return "sprint";
  }
  if (key.includes("task") || key.includes("kanban-task") || key.includes("kanban_task")) return "task";
  return null;
}

function pmRefFrom(
  refType: string | null | undefined,
  refId: string | null | undefined,
  label?: string | null,
  boardId?: string | null
): AgentspacePmRef | null {
  const id = refId?.trim();
  if (!id) return null;
  const kind = normalizePmRefKind(refType);
  if (!kind) return null;
  return {
    kind,
    id,
    boardId,
    rawType: refType,
    label: label || `${kind} · ${shortId(id)}`
  };
}

function uniquePmRefs(refs: Array<AgentspacePmRef | null | undefined>): AgentspacePmRef[] {
  const seen = new Set<string>();
  const result: AgentspacePmRef[] = [];
  for (const ref of refs) {
    if (!ref) continue;
    const key = `${ref.kind}:${ref.id}:${ref.boardId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }
  return result;
}

function memoryRefs(row: AgentspaceMemoryItem): AgentspacePmRef[] {
  const meta = row.meta;
  const boardId = metaString(meta, "boardId", "kanbanBoardId", "boardUid");
  return uniquePmRefs([
    pmRefFrom(row.sourceType, row.sourceId, sourceText(row), boardId),
    pmRefFrom("board", boardId),
    pmRefFrom("task", metaString(meta, "taskId", "kanbanTaskId", "taskUid"), null, boardId),
    pmRefFrom("sprint", metaString(meta, "sprintId", "sprintUid")),
    pmRefFrom("implementation-plan", metaString(meta, "planId", "implementationPlanId", "activeImplementationPlanId"))
  ]);
}

function AgentspaceRefButtons({
  refs,
  onOpen,
  t
}: {
  refs: AgentspacePmRef[] | null | undefined;
  onOpen: (target: ProjectmanRefTarget) => void;
  t: TFn;
}): ReactNode {
  if (!refs?.length) return null;
  return (
    <div className="aops-as-ref-list">
      <span>{t("asFieldRef")}</span>
      {refs.map((ref) => (
        <button
          key={`${ref.kind}:${ref.id}:${ref.boardId ?? ""}`}
          type="button"
          className="aops-as-ref-link"
          onClick={() => onOpen({ kind: ref.kind, id: ref.id, boardId: ref.boardId })}
        >
          {ref.label}
        </button>
      ))}
    </div>
  );
}

function MemorySourceValue({
  row,
  onOpen,
  t
}: {
  row: AgentspaceMemoryItem;
  onOpen: (target: ProjectmanRefTarget) => void;
  t: TFn;
}): ReactNode {
  const source = sourceText(row);
  if (!source) return t("unknownValue");
  const ref = memoryRefs(row)[0];
  if (!ref) return source;
  return (
    <button
      type="button"
      className="aops-as-ref-link is-inline"
      onClick={() => onOpen({ kind: ref.kind, id: ref.id, boardId: ref.boardId })}
    >
      {source}
    </button>
  );
}

function localeCode(locale: AopsCockpitLocale): string {
  return locale === "tr" ? "tr-TR" : "en-US";
}

function memoryCreatedValue(row: AgentspaceMemoryItem): string | null {
  return row.createdAt ?? row.updatedAt ?? null;
}

function memoryDateMs(row: AgentspaceMemoryItem): number {
  return Date.parse(memoryCreatedValue(row) ?? "") || 0;
}

function formatMemoryShortDate(value: string | null | undefined, locale: AopsCockpitLocale): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(localeCode(locale), { month: "short", day: "numeric" }).format(date);
}

function formatMemoryTime(value: string | null | undefined, locale: AopsCockpitLocale): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(localeCode(locale), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}

function formatMemoryDateTime(value: string | null | undefined, locale: AopsCockpitLocale): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${formatMemoryShortDate(value, locale)} · ${formatMemoryTime(value, locale)}`;
}

function formatMemoryDay(value: string | null | undefined, locale: AopsCockpitLocale): string {
  return formatMemoryShortDate(value, locale).toUpperCase();
}

function memoryMapRange(rows: AgentspaceMemoryItem[], locale: AopsCockpitLocale): string {
  if (!rows.length) return "";
  const first = memoryCreatedValue(rows[0]);
  const last = memoryCreatedValue(rows[rows.length - 1]);
  if (!first || !last) return "";
  return `${formatMemoryShortDate(first, locale)} - ${formatMemoryShortDate(last, locale)}`;
}

function memorySnippet(row: AgentspaceMemoryItem, length = 120): string {
  const text = (row.content ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= length) return text;
  return `${text.slice(0, length - 1).trim()}...`;
}

function memoryNeighborLabel(row: AgentspaceMemoryItem | null | undefined): string {
  return row?.kind ?? "none";
}

function latestDate(rows: AgentspaceMemoryItem[]): string | null {
  const latest = rows
    .map((row) => row.updatedAt ?? row.createdAt)
    .filter(Boolean)
    .sort((a, b) => Date.parse(b ?? "") - Date.parse(a ?? ""))[0];
  return latest ?? null;
}

function buildKindStats(rows: AgentspaceMemoryItem[]) {
  const groups = new Map<string, AgentspaceMemoryItem[]>();
  for (const row of rows) {
    const kind = (row.kind ?? "note").trim() || "note";
    groups.set(kind, [...(groups.get(kind) ?? []), row]);
  }
  return [...groups.entries()]
    .map(([kind, group]) => ({
      kind,
      count: group.length,
      color: memoryKindColor(kind),
      latest: latestDate(group),
      durability: group.find((row) => row.durability)?.durability ?? null,
      rows: group
    }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
}

function MemoryToggleIcon({ expanded }: { expanded: boolean }): ReactNode {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M3.5 8h9" />
      {!expanded ? <path d="M8 3.5v9" /> : null}
    </svg>
  );
}

function MemoryChevronIcon({ open }: { open?: boolean }): ReactNode {
  return (
    <svg className={open ? "is-open" : undefined} viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5.5 3.5 10 8l-4.5 4.5" />
    </svg>
  );
}

function MemorySearchIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function MemoryFunnelIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 5h18l-7 8v6l-4-2v-4z" />
    </svg>
  );
}

function MemoryKindDot({ kind }: { kind: string | null | undefined }): ReactNode {
  return <i className="aops-as-memory-dot" style={{ backgroundColor: memoryKindColor(kind) }} aria-hidden />;
}

function MemoryChip({
  children,
  kind,
  muted = false
}: {
  children: ReactNode;
  kind?: string | null;
  muted?: boolean;
}): ReactNode {
  return (
    <span
      className={`aops-as-memory-chip${muted ? " is-muted" : ""}`}
      style={kind && !muted ? { borderColor: memoryKindColor(kind), color: memoryKindColor(kind) } : undefined}
    >
      {children}
    </span>
  );
}

function MemoryKindPills({
  stats,
  value,
  onChange,
  t,
  compact = false
}: {
  stats: ReturnType<typeof buildKindStats>;
  value: string;
  onChange: (value: string) => void;
  t: TFn;
  compact?: boolean;
}): ReactNode {
  const top = stats.slice(0, compact ? 5 : 6);
  const total = stats.reduce((sum, entry) => sum + entry.count, 0);
  return (
    <div className={`aops-as-memory-kindpills${compact ? " is-compact" : ""}`} aria-label={t("asFieldKind")}>
      <button type="button" className={value === "all" ? "is-active" : undefined} onClick={() => onChange("all")}>
        {t("asFilterAll")} <span>{total}</span>
      </button>
      {top.map((entry) => (
        <button
          type="button"
          key={entry.kind}
          className={value === entry.kind ? "is-active" : undefined}
          onClick={() => onChange(entry.kind)}
        >
          {entry.kind} <span>{entry.count}</span>
        </button>
      ))}
    </div>
  );
}

function MemorySortControl({
  value,
  onChange,
  t
}: {
  value: MemorySortKey;
  onChange: (value: MemorySortKey) => void;
  t: TFn;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const options: Array<{ value: MemorySortKey; label: string }> = [
    { value: "updated", label: t("asMemorySortUpdated") },
    { value: "created", label: t("asMemorySortCreated") },
    { value: "kind", label: t("asMemorySortKind") },
    { value: "importance", label: t("asMemorySortImportance") }
  ];

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="aops-as-memory-sort" ref={rootRef}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {t("asMemorySortBy")} <span aria-hidden>v</span>
      </button>
      {open ? (
        <div className="aops-as-memory-sort-menu" role="menu">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === value}
              className={option.value === value ? "is-active" : undefined}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MemorySection({
  model,
  scopeKey,
  ui,
  setUi,
  viewMode,
  onOpenProjectmanRef,
  locale,
  t
}: {
  model: AgentspaceDataModel;
  scopeKey: string;
  ui: MemoryViewerUiState;
  setUi: (value: (prev: MemoryViewerUiState) => MemoryViewerUiState) => void;
  viewMode: MemoryViewMode;
  onOpenProjectmanRef: (target: ProjectmanRefTarget) => void;
  locale: AopsCockpitLocale;
  t: TFn;
}): ReactNode {
  const isMobile = useCockpitViewport().viewport === "mobile";
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsedKinds, setCollapsedKinds] = useState<Set<string>>(() => new Set());
  const kindStats = useMemo(() => buildKindStats(model.memoryItems), [model.memoryItems]);
  const sortKey = ui.sortByScope[scopeKey] ?? "updated";

  const setSortKey = (next: MemorySortKey) =>
    patchMemoryViewerUiState(setUi, (prev) => ({
      ...prev,
      sortByScope: { ...prev.sortByScope, [scopeKey]: next }
    }));
  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return model.memoryItems
      .filter((row) => (kindFilter === "all" ? true : row.kind === kindFilter))
      .filter((row) => (q ? memorySearchText(row).includes(q) : true))
      .sort((a, b) => {
        if (sortKey === "kind") return (a.kind ?? "").localeCompare(b.kind ?? "") || Date.parse(b.updatedAt ?? "") - Date.parse(a.updatedAt ?? "");
        if (sortKey === "importance") return (b.importance ?? -1) - (a.importance ?? -1) || Date.parse(b.updatedAt ?? "") - Date.parse(a.updatedAt ?? "");
        const aDate = sortKey === "created" ? a.createdAt : a.updatedAt;
        const bDate = sortKey === "created" ? b.createdAt : b.updatedAt;
        return (Date.parse(bDate ?? "") || 0) - (Date.parse(aDate ?? "") || 0);
      });
  }, [kindFilter, model.memoryItems, query, sortKey]);
  const storedExpandedIds = ui.expandedByScope[scopeKey];
  const expandedIds = useMemo(
    () => new Set(storedExpandedIds ?? (isMobile ? [] : filteredRows.slice(0, 1).map((row) => row.id))),
    [filteredRows, isMobile, storedExpandedIds]
  );
  const toggleExpanded = (id: string) =>
    patchMemoryViewerUiState(setUi, (prev) => {
      const current = new Set(prev.expandedByScope[scopeKey] ?? (isMobile ? [] : filteredRows.slice(0, 1).map((row) => row.id)));
      if (current.has(id)) current.delete(id);
      else current.add(id);
      return { ...prev, expandedByScope: { ...prev.expandedByScope, [scopeKey]: [...current] } };
    });
  const setAllExpanded = (expandAll: boolean) =>
    patchMemoryViewerUiState(setUi, (prev) => ({
      ...prev,
      expandedByScope: {
        ...prev.expandedByScope,
        [scopeKey]: expandAll ? filteredRows.map((row) => row.id) : []
      }
    }));

  const selected = selectedId ? filteredRows.find((row) => row.id === selectedId) ?? filteredRows[0] ?? null : filteredRows[0] ?? null;
  const toggleKindCollapsed = (kind: string) =>
    setCollapsedKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  if (model.memoryItems.length === 0) {
    return <WorkbenchStatePanel variant="empty" title={t("asSectionMemory")} message={t("asNoRecords")} />;
  }

  return (
    <div className="aops-as-memory" data-testid="aops-v2-as-memory-viewer" data-mode={viewMode}>
      {viewMode === "timeline" ? (
        <MemoryTimelineView
          rows={model.memoryItems}
          stats={kindStats}
          selectedId={selectedId}
          locale={locale}
          t={t}
          onOpenProjectmanRef={onOpenProjectmanRef}
          onSelect={setSelectedId}
        />
      ) : null}
      {viewMode === "cards" ? (
        <MemoryCardsView
          rows={filteredRows}
          stats={kindStats}
          query={query}
          sortKey={sortKey}
          kindFilter={kindFilter}
          expandedIds={expandedIds}
          locale={locale}
          t={t}
          onOpenProjectmanRef={onOpenProjectmanRef}
          onQueryChange={setQuery}
          onSortChange={setSortKey}
          onKindChange={setKindFilter}
          onToggleExpanded={toggleExpanded}
          onExpandAll={() => setAllExpanded(true)}
          onCollapseAll={() => setAllExpanded(false)}
        />
      ) : null}
      {viewMode === "read" ? (
        <MemoryReadView
          rows={filteredRows}
          stats={kindStats}
          selected={selected}
          query={query}
          kindFilter={kindFilter}
          locale={locale}
          t={t}
          onOpenProjectmanRef={onOpenProjectmanRef}
          onQueryChange={setQuery}
          onKindChange={setKindFilter}
          onSelect={setSelectedId}
        />
      ) : null}
      {viewMode === "digest" ? (
        <MemoryDigestView
          rows={model.memoryItems}
          stats={kindStats}
          collapsedKinds={collapsedKinds}
          locale={locale}
          t={t}
          onOpenProjectmanRef={onOpenProjectmanRef}
          onToggleKind={toggleKindCollapsed}
        />
      ) : null}
    </div>
  );
}

function MemoryTimelineView({
  rows,
  stats,
  selectedId,
  locale,
  t,
  onOpenProjectmanRef,
  onSelect
}: {
  rows: AgentspaceMemoryItem[];
  stats: ReturnType<typeof buildKindStats>;
  selectedId: string | null;
  locale: AopsCockpitLocale;
  t: TFn;
  onOpenProjectmanRef: (target: ProjectmanRefTarget) => void;
  onSelect: (id: string | null) => void;
}): ReactNode {
  const mapRows = useMemo(
    () => rows.slice().sort((a, b) => memoryDateMs(a) - memoryDateMs(b) || a.id.localeCompare(b.id)),
    [rows]
  );
  const railRows = useMemo(() => mapRows.slice().reverse(), [mapRows]);
  const selected = selectedId ? rows.find((row) => row.id === selectedId) ?? null : railRows[0] ?? null;
  const selectedMapIndex = selected ? mapRows.findIndex((row) => row.id === selected.id) : -1;
  const previous = selectedMapIndex > 0 ? mapRows[selectedMapIndex - 1] : null;
  const next = selectedMapIndex >= 0 && selectedMapIndex < mapRows.length - 1 ? mapRows[selectedMapIndex + 1] : null;
  const columns = 34;
  const freeCount = mapRows.length ? Math.ceil(mapRows.length / columns) * columns - mapRows.length : 0;
  const daysShown = new Set(railRows.map((row) => formatMemoryDay(memoryCreatedValue(row), locale)).filter(Boolean)).size;
  const [previewOpen, setPreviewOpen] = useState(true);
  const groups = useMemo(() => {
    const grouped: Array<{ key: string; label: string; rows: AgentspaceMemoryItem[] }> = [];
    for (const row of railRows) {
      const rawDate = memoryCreatedValue(row);
      const label = rawDate ? formatMemoryDay(rawDate, locale) : t("unknownValue");
      const key = label;
      const current = grouped[grouped.length - 1];
      if (current?.key === key) {
        current.rows.push(row);
      } else {
        grouped.push({ key, label, rows: [row] });
      }
    }
    return grouped;
  }, [locale, railRows, t]);

  useEffect(() => {
    if (!railRows.length) {
      if (selectedId) onSelect(null);
      return;
    }
    if (!selected || !rows.some((row) => row.id === selected.id)) {
      onSelect(railRows[0].id);
    }
  }, [onSelect, railRows, rows, selected, selectedId]);

  if (!rows.length) {
    return <div className="aops-as-memory-empty">{t("asNoRecords")}</div>;
  }

  return (
    <div className={`aops-as-memory-timeline${previewOpen ? "" : " is-preview-closed"}`}>
      <div className="aops-as-memory-timeline-left">
        <section className="aops-as-memory-map-panel" aria-label={t("asMemoryMap")}>
          <div className="aops-as-memory-map-head">
            <span>{t("asMemoryMap")}</span>
            <small>{rows.length} {t("asMemoryBlocks")} · {memoryMapRange(mapRows, locale)}</small>
          </div>
          <div className="aops-as-memory-map-surface">
            <div className="aops-as-memory-map-grid">
              {mapRows.map((row, index) => {
                const color = memoryKindColor(row.kind);
                const date = memoryCreatedValue(row);
                const isSelected = selected?.id === row.id;
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={`aops-as-memory-block${isSelected ? " is-selected" : ""}`}
                    style={{ backgroundColor: color }}
                    title={`${row.kind ?? "memory"} · ${shortId(row.id)}`}
                    aria-label={`${t("asSectionMemory")} ${index + 1}: ${memoryTitle(row)}`}
                    aria-pressed={isSelected}
                    onClick={() => {
                      setPreviewOpen(true);
                      onSelect(row.id);
                    }}
                  >
                    <span className="aops-as-memory-map-popover">
                      <span className="aops-as-memory-map-popover-head">
                        <i style={{ backgroundColor: color }} />
                        {row.kind ? <MemoryChip kind={row.kind}>{row.kind}</MemoryChip> : null}
                        <b>uid {shortId(row.id)}</b>
                      </span>
                      <span className="aops-as-memory-map-popover-meta">
                        {formatMemoryDateTime(date, locale)} · {row.sourceType ?? "source"}
                      </span>
                      <span className="aops-as-memory-map-popover-text">{memorySnippet(row)}</span>
                    </span>
                  </button>
                );
              })}
              {Array.from({ length: freeCount }).map((_, index) => (
                <span key={`free-${index}`} className="aops-as-memory-block is-free" aria-hidden />
              ))}
            </div>
          </div>
          <div className="aops-as-memory-map-legend">
            <span>{t("asMemoryOlder")}</span>
            {stats.map((entry) => (
              <span key={entry.kind}>
                <i style={{ backgroundColor: entry.kind === "note" ? "#CBBBA0" : entry.color }} /> {entry.kind}
              </span>
            ))}
            <span>{t("asMemoryNewer")}</span>
          </div>
        </section>
        <section className="aops-as-memory-timeline-rail" aria-label={t("asMemoryTimeline")}>
          <header>
            <span>{t("asMemoryTimeline")}</span>
            <small>{t("asMemoryNewestFirst")}</small>
            <b>{t("asMemoryAllKinds")}</b>
            <em>{daysShown} {t("asMemoryDaysShown")}</em>
          </header>
          <div className="aops-as-memory-rail-body">
            {groups.map((group) => (
              <div key={group.key} className="aops-as-memory-rail-day">
                <div className="aops-as-memory-rail-daylabel">{group.label}</div>
                {group.rows.map((row) => {
                  const date = memoryCreatedValue(row);
                  const isSelected = selected?.id === row.id;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      className={`aops-as-memory-rail-entry${isSelected ? " is-selected" : ""}`}
                      onClick={() => {
                        setPreviewOpen(true);
                        onSelect(row.id);
                      }}
                    >
                      <MemoryKindDot kind={row.kind} />
                      <time>{formatMemoryTime(date, locale)}</time>
                      {row.kind ? <MemoryChip kind={row.kind}>{row.kind}</MemoryChip> : null}
                      <span>{memoryTitle(row)}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      </div>
      {previewOpen ? (
        <MemoryTimelinePreview
          row={selected}
          blockIndex={selectedMapIndex}
          total={mapRows.length}
          previous={previous}
          next={next}
          locale={locale}
          t={t}
          onOpenProjectmanRef={onOpenProjectmanRef}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </div>
  );
}

function MemoryTimelinePreview({
  row,
  blockIndex,
  total,
  previous,
  next,
  locale,
  t,
  onOpenProjectmanRef,
  onClose
}: {
  row: AgentspaceMemoryItem | null;
  blockIndex: number;
  total: number;
  previous: AgentspaceMemoryItem | null;
  next: AgentspaceMemoryItem | null;
  locale: AopsCockpitLocale;
  t: TFn;
  onOpenProjectmanRef: (target: ProjectmanRefTarget) => void;
  onClose: () => void;
}): ReactNode {
  if (!row) {
    return <section className="aops-as-memory-timeline-preview"><WorkbenchStatePanel variant="empty" title={t("asSectionMemory")} message={t("asNoRecords")} /></section>;
  }
  const content = memoryContentParts(row);
  const created = memoryCreatedValue(row);
  const source = sourceText(row);
  return (
    <section className="aops-as-memory-timeline-preview">
      <div className="aops-as-memory-preview-head">
        <div className="aops-as-memory-preview-title">
          <div className="aops-as-memory-reader-eyebrow" style={{ color: memoryKindColor(row.kind) }}>
            {t("asSectionMemory")} · {row.kind ?? "note"}
          </div>
          {content.title ? <h3>{content.title}</h3> : null}
        </div>
        <button
          type="button"
          className="aops-pm-boardcard-action aops-as-memory-preview-close"
          aria-label={t("pmCardPaneClose")}
          title={t("pmCardPaneClose")}
          onClick={onClose}
        >
          {CloseIcon}
        </button>
      </div>
      <div className="aops-as-memory-reader-chips">
        {row.kind ? <MemoryChip kind={row.kind}>{row.kind}</MemoryChip> : null}
        {row.durability ? <MemoryChip muted>{row.durability}</MemoryChip> : null}
        <span className="aops-as-memory-reader-uid">{shortId(row.id)}</span>
      </div>
      <div className="aops-as-memory-timeline-infobar">
        {formatMemoryDateTime(created, locale)} · {t("asMemoryBlock")} {blockIndex + 1} / {total}
      </div>
      <section className="aops-as-memory-reader-content">
        <span>{t("asMemoryContent")}</span>
        <p>{content.body}</p>
      </section>
      <dl className="aops-as-memory-read-dl is-timeline">
        <div><dt>{t("asFieldSource")}</dt><dd>{source ? <MemorySourceValue row={row} onOpen={onOpenProjectmanRef} t={t} /> : t("unknownValue")}</dd></div>
        <div><dt>{t("asMemoryCreated")}</dt><dd>{formatPmDate(row.createdAt, locale)}</dd></div>
        <div><dt>{t("asMemoryNeighbors")}</dt><dd className="aops-pm-mono">← {memoryNeighborLabel(previous)} · {memoryNeighborLabel(next)} →</dd></div>
      </dl>
      <AgentspaceRefButtons refs={memoryRefs(row)} onOpen={onOpenProjectmanRef} t={t} />
      {row.tags?.length ? (
        <div className="aops-as-memory-tags is-reader">
          {row.tags.map((tag) => (
            <span key={tag} className={tag.startsWith("project:") ? "is-project" : undefined}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function MemoryCardsView({
  rows,
  stats,
  query,
  sortKey,
  kindFilter,
  expandedIds,
  locale,
  t,
  onOpenProjectmanRef,
  onQueryChange,
  onSortChange,
  onKindChange,
  onToggleExpanded,
  onExpandAll,
  onCollapseAll
}: {
  rows: AgentspaceMemoryItem[];
  stats: ReturnType<typeof buildKindStats>;
  query: string;
  sortKey: MemorySortKey;
  kindFilter: string;
  expandedIds: Set<string>;
  locale: AopsCockpitLocale;
  t: TFn;
  onOpenProjectmanRef: (target: ProjectmanRefTarget) => void;
  onQueryChange: (value: string) => void;
  onSortChange: (value: MemorySortKey) => void;
  onKindChange: (value: string) => void;
  onToggleExpanded: (id: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}): ReactNode {
  const [visibleCount, setVisibleCount] = useState(AGENTSPACE_CARD_PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(AGENTSPACE_CARD_PAGE_SIZE);
  }, [kindFilter, query, rows.length, sortKey]);
  const visibleRows = rows.slice(0, visibleCount);
  const shown = Math.min(visibleCount, rows.length);

  return (
    <>
      <div className="aops-as-memory-toolbar">
        <span className="aops-as-memory-tool-icon">{MemoryFunnelIcon()}</span>
        <MemorySortControl value={sortKey} onChange={onSortChange} t={t} />
        <span className="aops-as-memory-divider" aria-hidden />
        <MemoryKindPills stats={stats} value={kindFilter} onChange={onKindChange} t={t} />
        <label className="aops-as-memory-search">
          {MemorySearchIcon()}
          <input
            type="search"
            value={query}
            placeholder={`${t("asSearchMemory")}...`}
            aria-label={t("asSearchMemory")}
            onChange={(event) => onQueryChange(event.currentTarget.value)}
          />
        </label>
        <button type="button" className="aops-as-memory-linkbtn" onClick={onExpandAll}>
          {t("pmCardsExpandAll")}
        </button>
        <button type="button" className="aops-as-memory-linkbtn" onClick={onCollapseAll}>
          {t("pmCardsCollapseAll")}
        </button>
      </div>
      <div className="aops-as-memory-cards">
        {rows.length ? (
          visibleRows.map((row) => (
            <MemoryCard
              key={row.id}
              row={row}
              expanded={expandedIds.has(row.id)}
              locale={locale}
              t={t}
              onOpenProjectmanRef={onOpenProjectmanRef}
              onToggle={() => onToggleExpanded(row.id)}
            />
          ))
        ) : (
          <div className="aops-as-memory-empty">{t("asNoRecords")}</div>
        )}
      </div>
      {rows.length > AGENTSPACE_CARD_PAGE_SIZE ? (
        <div className="aops-as-memory-pagebar">
          <span>{shown} / {rows.length}</span>
          {shown < rows.length ? (
            <button type="button" className="aops-as-memory-linkbtn" onClick={() => setVisibleCount((count) => count + AGENTSPACE_CARD_PAGE_SIZE)}>
              {t("asPageLoadMore")}
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function MemoryCard({
  row,
  expanded,
  locale,
  t,
  onOpenProjectmanRef,
  onToggle
}: {
  row: AgentspaceMemoryItem;
  expanded: boolean;
  locale: AopsCockpitLocale;
  t: TFn;
  onOpenProjectmanRef: (target: ProjectmanRefTarget) => void;
  onToggle: () => void;
}): ReactNode {
  const source = sourceText(row);
  const refs = memoryRefs(row);
  return (
    <article className={`aops-as-memory-card${expanded ? " is-expanded" : ""}`}>
      <header className="aops-as-memory-card-head">
        <button type="button" className="aops-as-memory-toggle" onClick={onToggle} aria-expanded={expanded}>
          <span className="aops-as-memory-toggle-icon"><MemoryToggleIcon expanded={expanded} /></span>
          <span className="aops-as-memory-mobile-back-arrow" aria-hidden>←</span>
          <span className="aops-as-memory-mobile-back-label">{t("pmCardPaneClose")}</span>
        </button>
        <MemoryKindDot kind={row.kind} />
        <h3 title={row.content ?? row.id}>{memoryTitle(row)}</h3>
        {row.kind ? <MemoryChip kind={row.kind}>{row.kind}</MemoryChip> : null}
        {row.durability ? <MemoryChip muted>{row.durability}</MemoryChip> : null}
        {source ? <span className="aops-as-memory-card-source">{source}</span> : null}
        <span className="aops-as-memory-card-spacer" aria-hidden />
        <button type="button" className="aops-as-memory-chevron" onClick={onToggle} aria-label={expanded ? t("pmCardsCollapseAll") : t("pmCardsExpandAll")}>
          <MemoryChevronIcon open={expanded} />
        </button>
      </header>
      <div className="aops-as-memory-card-meta">
        {t("asMemoryCreated")} {formatPmDate(row.createdAt, locale)} · {t("asFieldUpdated")} {formatPmDate(row.updatedAt, locale)} · uid {shortId(row.id)}
      </div>
      {expanded ? (
        <div className="aops-as-memory-card-expanded">
          <dl className="aops-as-memory-fieldgrid">
            <div>
              <dt>{t("asFieldKind")}</dt>
              <dd>{row.kind ?? t("unknownValue")}</dd>
            </div>
            <div>
              <dt>{t("asFieldDurability")}</dt>
              <dd>{row.durability ?? t("unknownValue")}</dd>
            </div>
            <div>
              <dt>{t("asFieldSource")}</dt>
              <dd className="aops-pm-mono">
                <MemorySourceValue row={row} onOpen={onOpenProjectmanRef} t={t} />
              </dd>
            </div>
            <div>
              <dt>{t("asFieldUpdated")}</dt>
              <dd>{formatPmDate(row.updatedAt, locale)}</dd>
            </div>
          </dl>
          <div className="aops-as-memory-body">
            <span>{t("asSectionMemory")}</span>
            <p>{row.content ?? ""}</p>
          </div>
          <AgentspaceRefButtons refs={refs} onOpen={onOpenProjectmanRef} t={t} />
          {row.tags?.length ? (
            <div className="aops-as-memory-tags">
              {row.tags.map((tag) => (
                <span key={tag} className={tag.startsWith("project:") ? "is-project" : undefined}>
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function MemoryReadView({
  rows,
  stats,
  selected,
  query,
  kindFilter,
  locale,
  t,
  onOpenProjectmanRef,
  onQueryChange,
  onKindChange,
  onSelect
}: {
  rows: AgentspaceMemoryItem[];
  stats: ReturnType<typeof buildKindStats>;
  selected: AgentspaceMemoryItem | null;
  query: string;
  kindFilter: string;
  locale: AopsCockpitLocale;
  t: TFn;
  onOpenProjectmanRef: (target: ProjectmanRefTarget) => void;
  onQueryChange: (value: string) => void;
  onKindChange: (value: string) => void;
  onSelect: (id: string) => void;
}): ReactNode {
  return (
    <div className="aops-as-memory-read">
      <aside className="aops-as-memory-index">
        <label className="aops-as-memory-search is-index">
          {MemorySearchIcon()}
          <input
            type="search"
            value={query}
            placeholder={`${t("asSearchMemory")} ${stats.reduce((sum, entry) => sum + entry.count, 0)}`}
            aria-label={t("asSearchMemory")}
            onChange={(event) => onQueryChange(event.currentTarget.value)}
          />
        </label>
        <MemoryKindPills stats={stats} value={kindFilter} onChange={onKindChange} t={t} compact />
        <div className="aops-as-memory-index-list">
          {rows.map((row) => (
            <button
              type="button"
              key={row.id}
              className={selected?.id === row.id ? "is-selected" : undefined}
              onClick={() => onSelect(row.id)}
            >
              <MemoryKindDot kind={row.kind} />
              <span>
                <b>{memoryTitle(row)}</b>
                <small>{row.kind ?? "note"} · {row.durability ?? "short"} · {formatPmDate(row.updatedAt, locale)}</small>
              </span>
            </button>
          ))}
        </div>
      </aside>
      <section className="aops-as-memory-reader">
        {selected ? (() => {
          const content = memoryContentParts(selected);
          return (
            <>
              <div className="aops-as-memory-reader-eyebrow">
                {t("asSectionMemory")} · {selected.kind ?? "note"}
              </div>
              {content.title ? <h3>{content.title}</h3> : null}
            <div className="aops-as-memory-reader-chips">
              {selected.kind ? <MemoryChip kind={selected.kind}>{selected.kind}</MemoryChip> : null}
              {selected.durability ? <MemoryChip muted>{selected.durability}</MemoryChip> : null}
              {selected.importance != null ? <MemoryChip muted>{t("asFieldImportance")} {selected.importance}</MemoryChip> : null}
              <span className="aops-as-memory-reader-uid">uid {shortId(selected.id)}</span>
            </div>
            <section className="aops-as-memory-reader-content">
              <span>{t("asMemoryContent")}</span>
              <p>{content.body}</p>
            </section>
            <dl className="aops-as-memory-read-dl">
              <div><dt>{t("asFieldKind")}</dt><dd>{selected.kind ?? t("unknownValue")}</dd></div>
              <div><dt>{t("asFieldDurability")}</dt><dd>{selected.durability ?? t("unknownValue")}</dd></div>
              <div><dt>{t("asFieldSource")}</dt><dd><MemorySourceValue row={selected} onOpen={onOpenProjectmanRef} t={t} /></dd></div>
              <div><dt>{t("asFieldImportance")}</dt><dd>{selected.importance ?? t("unknownValue")}</dd></div>
              <div><dt>{t("asMemoryCreated")}</dt><dd>{formatPmDate(selected.createdAt, locale)}</dd></div>
              <div><dt>{t("asMemoryScope")}</dt><dd>{memoryScope(selected) ? shortId(memoryScope(selected) ?? "") : t("unknownValue")}</dd></div>
            </dl>
            <AgentspaceRefButtons refs={memoryRefs(selected)} onOpen={onOpenProjectmanRef} t={t} />
            {selected.tags?.length ? (
              <div className="aops-as-memory-tags is-reader">
                <span className="aops-as-memory-taglabel">{t("asMemoryTags")}</span>
                {selected.tags.map((tag) => (
                  <span key={tag} className={tag.startsWith("project:") ? "is-project" : undefined}>
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </>
          );
        })() : (
          <WorkbenchStatePanel variant="empty" title={t("asSectionMemory")} message={t("asNoRecords")} />
        )}
      </section>
    </div>
  );
}

function MemoryDigestView({
  rows,
  stats,
  collapsedKinds,
  locale,
  t,
  onOpenProjectmanRef,
  onToggleKind
}: {
  rows: AgentspaceMemoryItem[];
  stats: ReturnType<typeof buildKindStats>;
  collapsedKinds: Set<string>;
  locale: AopsCockpitLocale;
  t: TFn;
  onOpenProjectmanRef: (target: ProjectmanRefTarget) => void;
  onToggleKind: (kind: string) => void;
}): ReactNode {
  const total = rows.length || 1;
  const [selectedDigestId, setSelectedDigestId] = useState<string | null>(null);
  const [visibleByKind, setVisibleByKind] = useState<Record<string, number>>({});
  useEffect(() => {
    setSelectedDigestId(null);
    setVisibleByKind({});
  }, [rows]);
  const selectedDigestRow = selectedDigestId ? rows.find((row) => row.id === selectedDigestId) ?? null : null;
  return (
    <div className={`aops-as-memory-digest${selectedDigestRow ? " has-pane" : ""}`}>
      <section className="aops-as-memory-breakdown">
        <div className="aops-as-memory-breakdown-head">
          <span>{rows.length} {t("asSectionMemory")} · {t("asMemoryByKind")}</span>
          <small>{stats.length} {t("asFieldKind")} · scope {memoryScope(rows[0]) ? shortId(memoryScope(rows[0]) ?? "") : t("unknownValue")}</small>
        </div>
        <div className="aops-as-memory-stackbar" aria-hidden>
          {stats.map((entry) => (
            <span key={entry.kind} style={{ width: `${Math.max(2, (entry.count / total) * 100)}%`, backgroundColor: entry.color }} />
          ))}
        </div>
        <div className="aops-as-memory-legend">
          {stats.map((entry) => (
            <span key={entry.kind}>
              <i style={{ backgroundColor: entry.color }} /> {entry.kind} <b>{entry.count}</b>
            </span>
          ))}
        </div>
      </section>
      <section className="aops-as-memory-digest-card">
        {stats.map((entry) => {
          const collapsed = collapsedKinds.has(entry.kind);
          const visibleCount = visibleByKind[entry.kind] ?? AGENTSPACE_DIGEST_INITIAL_ROWS;
          const visibleRows = entry.rows.slice(0, visibleCount);
          const hidden = Math.max(0, entry.rows.length - visibleRows.length);
          return (
            <div key={entry.kind} className="aops-as-memory-digest-section">
              <button type="button" className={collapsed ? undefined : "is-open"} onClick={() => onToggleKind(entry.kind)}>
                <MemoryChevronIcon open={!collapsed} />
                <MemoryKindDot kind={entry.kind} />
                <span>{entry.kind}</span>
                <b>{entry.count}</b>
                <small>{entry.durability ?? "short"} · {t("asMemoryLatest")} {formatPmDate(entry.latest, locale)}</small>
              </button>
              {!collapsed ? (
                <div className="aops-as-memory-digest-rows">
                  {visibleRows.map((row) => (
                    <div key={row.id} className={`aops-as-memory-digest-row${selectedDigestId === row.id ? " is-selected" : ""}`}>
                      <button type="button" className="aops-as-memory-digest-title" onClick={() => setSelectedDigestId(row.id)}>
                        {memoryTitle(row)}
                      </button>
                      <small>{sourceText(row) ?? shortId(row.id)}</small>
                      {row.durability ? <MemoryChip muted>{row.durability}</MemoryChip> : null}
                      <time>{formatPmDate(row.updatedAt, locale)}</time>
                      <button type="button" className="aops-as-memory-rowlink" onClick={() => setSelectedDigestId(row.id)}>
                        {t("asOpenDigestPane")}
                      </button>
                    </div>
                  ))}
                  {hidden ? (
                    <button
                      type="button"
                      className="aops-as-memory-showmore"
                      onClick={() =>
                        setVisibleByKind((prev) => ({
                          ...prev,
                          [entry.kind]: visibleRows.length + AGENTSPACE_DIGEST_PAGE_SIZE
                        }))
                      }
                    >
                      {t("asMemoryShowMore")} {hidden} {entry.kind}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </section>
      {selectedDigestRow ? (
        <MemoryDigestPane
          row={selectedDigestRow}
          locale={locale}
          t={t}
          onOpenProjectmanRef={onOpenProjectmanRef}
          onClose={() => setSelectedDigestId(null)}
        />
      ) : null}
    </div>
  );
}

function MemoryDigestPane({
  row,
  locale,
  t,
  onOpenProjectmanRef,
  onClose
}: {
  row: AgentspaceMemoryItem;
  locale: AopsCockpitLocale;
  t: TFn;
  onOpenProjectmanRef: (target: ProjectmanRefTarget) => void;
  onClose: () => void;
}): ReactNode {
  const source = sourceText(row);
  const content = memoryContentParts(row);
  return (
    <aside className="aops-as-memory-digest-pane">
      <div className="aops-as-memory-digest-pane-head">
        <span>{t("asSectionMemory")} · {row.kind ?? "note"}</span>
        <button type="button" onClick={onClose}>{t("asCloseDigestPane")}</button>
      </div>
      {content.title ? <h3>{content.title}</h3> : null}
      <p>{content.body}</p>
      <AgentspaceRefButtons refs={memoryRefs(row)} onOpen={onOpenProjectmanRef} t={t} />
      <dl>
        <div><dt>{t("asFieldSource")}</dt><dd>{source ? <MemorySourceValue row={row} onOpen={onOpenProjectmanRef} t={t} /> : t("unknownValue")}</dd></div>
        <div><dt>{t("asFieldDurability")}</dt><dd>{row.durability ?? t("unknownValue")}</dd></div>
        <div><dt>{t("asFieldUpdated")}</dt><dd>{formatPmDate(row.updatedAt, locale)}</dd></div>
        <div><dt>uid</dt><dd>{shortId(row.id)}</dd></div>
      </dl>
    </aside>
  );
}

function recordSearchText(item: RecordListItem): string {
  return [
    item.title,
    item.status,
    item.eyebrow,
    item.searchText,
    ...item.chips.map((chip) => chip.label),
    ...item.fields.flatMap((field) => [field.label, field.value]),
    ...(item.body ?? []).flatMap((block) => [block.heading, block.text]),
    ...(item.tags ?? [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function recordStatusColor(status: string | null | undefined): string {
  const key = (status ?? "").toLowerCase();
  if (["active", "open", "ready", "running", "in-progress", "in_progress"].includes(key)) return "#5B8B6F";
  if (["completed", "complete", "done", "resolved", "concluded", "closed"].includes(key)) return "#4A6B91";
  if (["draft", "pending", "planned", "todo", "queued"].includes(key)) return "#E89A4A";
  if (["blocked", "error", "failed", "cancelled", "canceled"].includes(key)) return "#B3503C";
  return "#D2C2A4";
}

function recordStatusLabel(item: RecordListItem, t: TFn): string {
  return item.status ?? t("pmUnknownStatus");
}

function recordDate(item: RecordListItem, key: "created" | "updated"): string | undefined {
  return key === "created" ? item.createdAt : item.updatedAt ?? item.createdAt;
}

function buildRecordStatusStats(items: RecordListItem[], t: TFn) {
  const groups = new Map<string, RecordListItem[]>();
  for (const item of items) {
    const status = recordStatusLabel(item, t);
    groups.set(status, [...(groups.get(status) ?? []), item]);
  }
  return [...groups.entries()]
    .map(([status, rows]) => ({
      status,
      count: rows.length,
      color: recordStatusColor(status),
      latest: latestRecordDate(rows),
      rows
    }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));
}

function latestRecordDate(items: RecordListItem[]): string | null {
  return items
    .map((item) => item.updatedAt ?? item.createdAt)
    .filter(Boolean)
    .sort((a, b) => Date.parse(b ?? "") - Date.parse(a ?? ""))[0] ?? null;
}

function RecordStatusDot({ status }: { status: string | null | undefined }): ReactNode {
  return <i className="aops-as-memory-dot" style={{ backgroundColor: recordStatusColor(status) }} aria-hidden />;
}

function RecordStatusChip({
  status,
  children
}: {
  status: string | null | undefined;
  children: ReactNode;
}): ReactNode {
  return (
    <span className="aops-as-memory-chip" style={{ borderColor: recordStatusColor(status), color: recordStatusColor(status) }}>
      {children}
    </span>
  );
}

function RecordStatusPills({
  stats,
  value,
  onChange,
  t,
  compact = false
}: {
  stats: ReturnType<typeof buildRecordStatusStats>;
  value: string;
  onChange: (value: string) => void;
  t: TFn;
  compact?: boolean;
}): ReactNode {
  const total = stats.reduce((sum, entry) => sum + entry.count, 0);
  return (
    <div className={`aops-as-memory-kindpills${compact ? " is-compact" : ""}`} aria-label={t("pmFieldStatus")}>
      <button type="button" className={value === "all" ? "is-active" : undefined} onClick={() => onChange("all")}>
        {t("asFilterAll")} <span>{total}</span>
      </button>
      {stats.slice(0, compact ? 5 : 6).map((entry) => (
        <button
          type="button"
          key={entry.status}
          className={value === entry.status ? "is-active" : undefined}
          onClick={() => onChange(entry.status)}
        >
          {entry.status} <span>{entry.count}</span>
        </button>
      ))}
    </div>
  );
}

function AgentspaceRecordSortControl({
  value,
  onChange,
  t
}: {
  value: MemorySortKey;
  onChange: (value: MemorySortKey) => void;
  t: TFn;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const options: Array<{ value: MemorySortKey; label: string }> = [
    { value: "updated", label: t("asMemorySortUpdated") },
    { value: "created", label: t("asMemorySortCreated") },
    { value: "status", label: t("pmFieldStatus") },
    { value: "title", label: t("pmCardsSortName") }
  ];

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="aops-as-memory-sort" ref={rootRef}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((next) => !next)}>
        {t("asMemorySortBy")} <span aria-hidden>v</span>
      </button>
      {open ? (
        <div className="aops-as-memory-sort-menu" role="menu">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === value}
              className={option.value === value ? "is-active" : undefined}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function sortRecordItems<T extends RecordListItem>(items: T[], sortKey: MemorySortKey): T[] {
  return items.slice().sort((a, b) => {
    if (sortKey === "status") {
      return (a.status ?? "").localeCompare(b.status ?? "") || (Date.parse(recordDate(b, "updated") ?? "") || 0) - (Date.parse(recordDate(a, "updated") ?? "") || 0);
    }
    if (sortKey === "title") return a.title.localeCompare(b.title);
    const dateKey = sortKey === "created" ? "created" : "updated";
    return (Date.parse(recordDate(b, dateKey) ?? "") || 0) - (Date.parse(recordDate(a, dateKey) ?? "") || 0);
  });
}

function AgentspaceRecordSection({
  title,
  searchLabel,
  emptyLabel,
  items,
  scopeKey,
  ui,
  setUi,
  viewMode,
  locale,
  t,
  onOpenProjectmanRef,
  cardDetailExtra,
  detailExtra
}: {
  title: string;
  searchLabel: string;
  emptyLabel: string;
  items: AgentspaceRecordItem[];
  scopeKey: string;
  ui: MemoryViewerUiState;
  setUi: (value: (prev: MemoryViewerUiState) => MemoryViewerUiState) => void;
  viewMode: MemoryViewMode;
  locale: AopsCockpitLocale;
  t: TFn;
  onOpenProjectmanRef: (target: ProjectmanRefTarget) => void;
  cardDetailExtra?: (item: AgentspaceRecordItem) => ReactNode;
  detailExtra?: (item: AgentspaceRecordItem) => ReactNode;
}): ReactNode {
  const isMobile = useCockpitViewport().viewport === "mobile";
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsedStatuses, setCollapsedStatuses] = useState<Set<string>>(() => new Set());
  const stats = useMemo(() => buildRecordStatusStats(items, t), [items, t]);
  const sortKey = ui.sortByScope[scopeKey] ?? "updated";

  const setSortKey = (next: MemorySortKey) =>
    patchMemoryViewerUiState(setUi, (prev) => ({
      ...prev,
      sortByScope: { ...prev.sortByScope, [scopeKey]: next }
    }));
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = items
      .filter((item) => (statusFilter === "all" ? true : recordStatusLabel(item, t) === statusFilter))
      .filter((item) => (q ? recordSearchText(item).includes(q) : true));
    return sortRecordItems(rows, sortKey);
  }, [items, query, sortKey, statusFilter, t]);
  const storedExpandedIds = ui.expandedByScope[scopeKey];
  const expandedIds = useMemo(
    () => new Set(storedExpandedIds ?? (isMobile ? [] : filtered.slice(0, 1).map((item) => item.id))),
    [filtered, isMobile, storedExpandedIds]
  );
  const toggleExpanded = (id: string) =>
    patchMemoryViewerUiState(setUi, (prev) => {
      const current = new Set(prev.expandedByScope[scopeKey] ?? (isMobile ? [] : filtered.slice(0, 1).map((item) => item.id)));
      if (current.has(id)) current.delete(id);
      else current.add(id);
      return { ...prev, expandedByScope: { ...prev.expandedByScope, [scopeKey]: [...current] } };
    });
  const selected = selectedId ? filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null : filtered[0] ?? null;
  const setAllExpanded = (expandAll: boolean) =>
    patchMemoryViewerUiState(setUi, (prev) => ({
      ...prev,
      expandedByScope: {
        ...prev.expandedByScope,
        [scopeKey]: expandAll ? filtered.map((item) => item.id) : []
      }
    }));
  const toggleStatusCollapsed = (status: string) =>
    setCollapsedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });

  if (items.length === 0) {
    return <WorkbenchStatePanel variant="empty" title={title} message={emptyLabel} />;
  }

  return (
    <div className="aops-as-memory aops-as-record" data-testid={`aops-v2-${scopeKey}-viewer`} data-mode={viewMode}>
      {viewMode === "cards" ? (
        <AgentspaceRecordCardsView
          rows={filtered}
          stats={stats}
          query={query}
          statusFilter={statusFilter}
          sortKey={sortKey}
          expandedIds={expandedIds}
          searchLabel={searchLabel}
          locale={locale}
          t={t}
          onOpenProjectmanRef={onOpenProjectmanRef}
          detailExtra={cardDetailExtra}
          onQueryChange={setQuery}
          onStatusChange={setStatusFilter}
          onSortChange={setSortKey}
          onToggleExpanded={toggleExpanded}
          onExpandAll={() => setAllExpanded(true)}
          onCollapseAll={() => setAllExpanded(false)}
        />
      ) : null}
      {viewMode === "read" ? (
        <AgentspaceRecordReadView
          rows={filtered}
          stats={stats}
          selected={selected}
          query={query}
          statusFilter={statusFilter}
          title={title}
          searchLabel={searchLabel}
          locale={locale}
          t={t}
          onOpenProjectmanRef={onOpenProjectmanRef}
          detailExtra={detailExtra}
          onQueryChange={setQuery}
          onStatusChange={setStatusFilter}
          onSelect={setSelectedId}
        />
      ) : null}
      {viewMode === "digest" ? (
        <AgentspaceRecordDigestView
          title={title}
          rows={items}
          stats={stats}
          collapsedStatuses={collapsedStatuses}
          locale={locale}
          t={t}
          onOpenProjectmanRef={onOpenProjectmanRef}
          onToggleStatus={toggleStatusCollapsed}
        />
      ) : null}
    </div>
  );
}

function AgentspaceRecordCardsView({
  rows,
  stats,
  query,
  statusFilter,
  sortKey,
  expandedIds,
  searchLabel,
  locale,
  t,
  onOpenProjectmanRef,
  detailExtra,
  onQueryChange,
  onStatusChange,
  onSortChange,
  onToggleExpanded,
  onExpandAll,
  onCollapseAll
}: {
  rows: AgentspaceRecordItem[];
  stats: ReturnType<typeof buildRecordStatusStats>;
  query: string;
  statusFilter: string;
  sortKey: MemorySortKey;
  expandedIds: Set<string>;
  searchLabel: string;
  locale: AopsCockpitLocale;
  t: TFn;
  onOpenProjectmanRef: (target: ProjectmanRefTarget) => void;
  detailExtra?: (item: AgentspaceRecordItem) => ReactNode;
  onQueryChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onSortChange: (value: MemorySortKey) => void;
  onToggleExpanded: (id: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}): ReactNode {
  const [visibleCount, setVisibleCount] = useState(AGENTSPACE_CARD_PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(AGENTSPACE_CARD_PAGE_SIZE);
  }, [query, rows.length, sortKey, statusFilter]);
  const visibleRows = rows.slice(0, visibleCount);
  const shown = Math.min(visibleCount, rows.length);

  return (
    <>
      <div className="aops-as-memory-toolbar">
        <span className="aops-as-memory-tool-icon">{MemoryFunnelIcon()}</span>
        <AgentspaceRecordSortControl value={sortKey} onChange={onSortChange} t={t} />
        <span className="aops-as-memory-divider" aria-hidden />
        <RecordStatusPills stats={stats} value={statusFilter} onChange={onStatusChange} t={t} />
        <label className="aops-as-memory-search">
          {MemorySearchIcon()}
          <input
            type="search"
            value={query}
            placeholder={`${searchLabel}...`}
            aria-label={searchLabel}
            onChange={(event) => onQueryChange(event.currentTarget.value)}
          />
        </label>
        <button type="button" className="aops-as-memory-linkbtn" onClick={onExpandAll}>
          {t("pmCardsExpandAll")}
        </button>
        <button type="button" className="aops-as-memory-linkbtn" onClick={onCollapseAll}>
          {t("pmCardsCollapseAll")}
        </button>
      </div>
      <div className="aops-as-memory-cards">
        {rows.length ? (
          visibleRows.map((row) => (
            <AgentspaceRecordCard
              key={row.id}
              item={row}
              expanded={expandedIds.has(row.id)}
              locale={locale}
              t={t}
              onOpenProjectmanRef={onOpenProjectmanRef}
              detailExtra={detailExtra}
              onToggle={() => onToggleExpanded(row.id)}
            />
          ))
        ) : (
          <div className="aops-as-memory-empty">{t("asNoRecords")}</div>
        )}
      </div>
      {rows.length > AGENTSPACE_CARD_PAGE_SIZE ? (
        <div className="aops-as-memory-pagebar">
          <span>{shown} / {rows.length}</span>
          {shown < rows.length ? (
            <button type="button" className="aops-as-memory-linkbtn" onClick={() => setVisibleCount((count) => count + AGENTSPACE_CARD_PAGE_SIZE)}>
              {t("asPageLoadMore")}
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function AgentspaceRecordCard({
  item,
  expanded,
  locale,
  t,
  onOpenProjectmanRef,
  detailExtra,
  onToggle
}: {
  item: AgentspaceRecordItem;
  expanded: boolean;
  locale: AopsCockpitLocale;
  t: TFn;
  onOpenProjectmanRef: (target: ProjectmanRefTarget) => void;
  detailExtra?: (item: AgentspaceRecordItem) => ReactNode;
  onToggle: () => void;
}): ReactNode {
  return (
    <article className={`aops-as-memory-card${expanded ? " is-expanded" : ""}`}>
      <header className="aops-as-memory-card-head">
        <button type="button" className="aops-as-memory-toggle" onClick={onToggle} aria-expanded={expanded}>
          <span className="aops-as-memory-toggle-icon"><MemoryToggleIcon expanded={expanded} /></span>
          <span className="aops-as-memory-mobile-back-arrow" aria-hidden>←</span>
          <span className="aops-as-memory-mobile-back-label">{t("pmCardPaneClose")}</span>
        </button>
        <RecordStatusDot status={item.status} />
        <h3 title={item.title}>{item.title}</h3>
        <RecordStatusChip status={item.status}>{recordStatusLabel(item, t)}</RecordStatusChip>
        {item.chips.slice(0, 2).map((chip, index) => (
          <MemoryChip key={`${chip.label}-${index}`} muted>{chip.label}</MemoryChip>
        ))}
        <span className="aops-as-memory-card-source">uid {shortId(item.id)}</span>
        <span className="aops-as-memory-card-spacer" aria-hidden />
        <button type="button" className="aops-as-memory-chevron" onClick={onToggle} aria-label={expanded ? t("pmCardsCollapseAll") : t("pmCardsExpandAll")}>
          <MemoryChevronIcon open={expanded} />
        </button>
      </header>
      <div className="aops-as-memory-card-meta">
        {t("asMemoryCreated")} {formatPmDate(item.createdAt, locale)} · {t("asFieldUpdated")} {formatPmDate(item.updatedAt, locale)} · uid {shortId(item.id)}
      </div>
      {expanded ? (
        <div className="aops-as-memory-card-expanded">
          <dl className="aops-as-memory-fieldgrid">
            {item.fields.slice(0, 4).map((field) => (
              <div key={field.label}>
                <dt>{field.label}</dt>
                <dd>{field.value ?? t("unknownValue")}</dd>
              </div>
            ))}
          </dl>
          {(item.body ?? []).map((block) => (
            <div key={block.heading} className="aops-as-memory-body">
              <span>{block.heading}</span>
              <p>{block.text || t("unknownValue")}</p>
            </div>
          ))}
          <AgentspaceRefButtons refs={item.refs} onOpen={onOpenProjectmanRef} t={t} />
          {item.tags?.length ? (
            <div className="aops-as-memory-tags">
              {item.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          ) : null}
          {detailExtra ? <div className="aops-as-record-extra">{detailExtra(item)}</div> : null}
        </div>
      ) : null}
    </article>
  );
}

function AgentspaceRecordReadView({
  rows,
  stats,
  selected,
  query,
  statusFilter,
  title,
  searchLabel,
  locale,
  t,
  onOpenProjectmanRef,
  detailExtra,
  onQueryChange,
  onStatusChange,
  onSelect
}: {
  rows: AgentspaceRecordItem[];
  stats: ReturnType<typeof buildRecordStatusStats>;
  selected: AgentspaceRecordItem | null;
  query: string;
  statusFilter: string;
  title: string;
  searchLabel: string;
  locale: AopsCockpitLocale;
  t: TFn;
  onOpenProjectmanRef: (target: ProjectmanRefTarget) => void;
  detailExtra?: (item: AgentspaceRecordItem) => ReactNode;
  onQueryChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onSelect: (id: string) => void;
}): ReactNode {
  return (
    <div className="aops-as-memory-read">
      <aside className="aops-as-memory-index">
        <label className="aops-as-memory-search is-index">
          {MemorySearchIcon()}
          <input
            type="search"
            value={query}
            placeholder={`${searchLabel} ${stats.reduce((sum, entry) => sum + entry.count, 0)}`}
            aria-label={searchLabel}
            onChange={(event) => onQueryChange(event.currentTarget.value)}
          />
        </label>
        <RecordStatusPills stats={stats} value={statusFilter} onChange={onStatusChange} t={t} compact />
        <div className="aops-as-memory-index-list">
          {rows.map((row) => (
            <button
              type="button"
              key={row.id}
              className={selected?.id === row.id ? "is-selected" : undefined}
              onClick={() => onSelect(row.id)}
            >
              <RecordStatusDot status={row.status} />
              <span>
                <b>{row.title}</b>
                <small>{recordStatusLabel(row, t)} · {formatPmDate(recordDate(row, "updated"), locale)} · uid {shortId(row.id)}</small>
              </span>
            </button>
          ))}
          {rows.length === 0 ? <div className="aops-as-memory-empty">{t("asNoRecords")}</div> : null}
        </div>
      </aside>
      <section className="aops-as-memory-reader">
        {selected ? (
          <>
            <div className="aops-as-memory-reader-eyebrow">
              {title} · {recordStatusLabel(selected, t)}
            </div>
            <h3>{selected.title}</h3>
            <div className="aops-as-memory-reader-chips">
              <RecordStatusChip status={selected.status}>{recordStatusLabel(selected, t)}</RecordStatusChip>
              {selected.chips.slice(0, 3).map((chip, index) => (
                <MemoryChip key={`${chip.label}-${index}`} muted>{chip.label}</MemoryChip>
              ))}
              <span className="aops-as-memory-reader-uid">uid {shortId(selected.id)}</span>
            </div>
            {(selected.body ?? []).map((block) => (
              <section key={block.heading} className="aops-as-memory-reader-content">
                <span>{block.heading}</span>
                <p>{block.text || t("unknownValue")}</p>
              </section>
            ))}
            <dl className="aops-as-memory-read-dl">
              {selected.fields.map((field) => (
                <div key={field.label}><dt>{field.label}</dt><dd>{field.value ?? t("unknownValue")}</dd></div>
              ))}
              <div><dt>{t("asMemoryCreated")}</dt><dd>{formatPmDate(selected.createdAt, locale)}</dd></div>
              <div><dt>{t("asFieldUpdated")}</dt><dd>{formatPmDate(selected.updatedAt, locale)}</dd></div>
            </dl>
            <AgentspaceRefButtons refs={selected.refs} onOpen={onOpenProjectmanRef} t={t} />
            {selected.tags?.length ? (
              <div className="aops-as-memory-tags is-reader">
                <span className="aops-as-memory-taglabel">{t("asMemoryTags")}</span>
                {selected.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            ) : null}
            {detailExtra ? <div className="aops-as-record-extra is-reader">{detailExtra(selected)}</div> : null}
          </>
        ) : (
          <WorkbenchStatePanel variant="empty" title={title} message={t("asNoRecords")} />
        )}
      </section>
    </div>
  );
}

function AgentspaceRecordDigestView({
  title,
  rows,
  stats,
  collapsedStatuses,
  locale,
  t,
  onOpenProjectmanRef,
  onToggleStatus
}: {
  title: string;
  rows: AgentspaceRecordItem[];
  stats: ReturnType<typeof buildRecordStatusStats>;
  collapsedStatuses: Set<string>;
  locale: AopsCockpitLocale;
  t: TFn;
  onOpenProjectmanRef: (target: ProjectmanRefTarget) => void;
  onToggleStatus: (status: string) => void;
}): ReactNode {
  const total = rows.length || 1;
  const [selectedDigestId, setSelectedDigestId] = useState<string | null>(null);
  const [visibleByStatus, setVisibleByStatus] = useState<Record<string, number>>({});
  useEffect(() => {
    setSelectedDigestId(null);
    setVisibleByStatus({});
  }, [rows]);
  const selectedDigestItem = selectedDigestId ? rows.find((row) => row.id === selectedDigestId) ?? null : null;
  return (
    <div className={`aops-as-memory-digest${selectedDigestItem ? " has-pane" : ""}`}>
      <section className="aops-as-memory-breakdown">
        <div className="aops-as-memory-breakdown-head">
          <span>{rows.length} {title} · {t("pmFieldStatus")}</span>
          <small>{stats.length} {t("pmFieldStatus")}</small>
        </div>
        <div className="aops-as-memory-stackbar" aria-hidden>
          {stats.map((entry) => (
            <span key={entry.status} style={{ width: `${Math.max(2, (entry.count / total) * 100)}%`, backgroundColor: entry.color }} />
          ))}
        </div>
        <div className="aops-as-memory-legend">
          {stats.map((entry) => (
            <span key={entry.status}>
              <i style={{ backgroundColor: entry.color }} /> {entry.status} <b>{entry.count}</b>
            </span>
          ))}
        </div>
      </section>
      <section className="aops-as-memory-digest-card">
        {stats.map((entry) => {
          const collapsed = collapsedStatuses.has(entry.status);
          const visibleCount = visibleByStatus[entry.status] ?? AGENTSPACE_DIGEST_INITIAL_ROWS;
          const visibleRows = entry.rows.slice(0, visibleCount);
          const hidden = Math.max(0, entry.rows.length - visibleRows.length);
          return (
            <div key={entry.status} className="aops-as-memory-digest-section">
              <button type="button" className={collapsed ? undefined : "is-open"} onClick={() => onToggleStatus(entry.status)}>
                <MemoryChevronIcon open={!collapsed} />
                <RecordStatusDot status={entry.status} />
                <span>{entry.status}</span>
                <b>{entry.count}</b>
                <small>{t("asMemoryLatest")} {formatPmDate(entry.latest, locale)}</small>
              </button>
              {!collapsed ? (
                <div className="aops-as-memory-digest-rows">
                  {visibleRows.map((row) => (
                    <div key={row.id} className={`aops-as-memory-digest-row${selectedDigestId === row.id ? " is-selected" : ""}`}>
                      <button type="button" className="aops-as-memory-digest-title" onClick={() => setSelectedDigestId(row.id)}>
                        {row.title}
                      </button>
                      <small>uid {shortId(row.id)}</small>
                      <MemoryChip muted>{recordStatusLabel(row, t)}</MemoryChip>
                      {row.chips.filter((chip) => chip.tone === "coral").slice(0, 1).map((chip, index) => (
                        <MemoryChip key={`${chip.label}-${index}`} muted>{chip.label}</MemoryChip>
                      ))}
                      <time>{formatPmDate(recordDate(row, "updated"), locale)}</time>
                      <button type="button" className="aops-as-memory-rowlink" onClick={() => setSelectedDigestId(row.id)}>
                        {t("asOpenDigestPane")}
                      </button>
                    </div>
                  ))}
                  {hidden ? (
                    <button
                      type="button"
                      className="aops-as-memory-showmore"
                      onClick={() =>
                        setVisibleByStatus((prev) => ({
                          ...prev,
                          [entry.status]: visibleRows.length + AGENTSPACE_DIGEST_PAGE_SIZE
                        }))
                      }
                    >
                      {t("asMemoryShowMore")} {hidden} {entry.status}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </section>
      {selectedDigestItem ? (
        <RecordDigestPane
          item={selectedDigestItem}
          title={title}
          locale={locale}
          t={t}
          onOpenProjectmanRef={onOpenProjectmanRef}
          onClose={() => setSelectedDigestId(null)}
        />
      ) : null}
    </div>
  );
}

function RecordDigestPane({
  item,
  title,
  locale,
  t,
  onOpenProjectmanRef,
  onClose
}: {
  item: AgentspaceRecordItem;
  title: string;
  locale: AopsCockpitLocale;
  t: TFn;
  onOpenProjectmanRef: (target: ProjectmanRefTarget) => void;
  onClose: () => void;
}): ReactNode {
  return (
    <aside className="aops-as-memory-digest-pane">
      <div className="aops-as-memory-digest-pane-head">
        <span>{title} · {recordStatusLabel(item, t)}</span>
        <button type="button" onClick={onClose}>{t("asCloseDigestPane")}</button>
      </div>
      <h3>{item.title}</h3>
      {(item.body ?? []).map((block) => (
        <section key={block.heading}>
          <span>{block.heading}</span>
          <p>{block.text || t("unknownValue")}</p>
        </section>
      ))}
      <AgentspaceRefButtons refs={item.refs} onOpen={onOpenProjectmanRef} t={t} />
      <dl>
        {item.fields.slice(0, 6).map((field) => (
          <div key={field.label}><dt>{field.label}</dt><dd>{field.value ?? t("unknownValue")}</dd></div>
        ))}
        <div><dt>{t("asFieldUpdated")}</dt><dd>{formatPmDate(recordDate(item, "updated"), locale)}</dd></div>
        <div><dt>uid</dt><dd>{shortId(item.id)}</dd></div>
      </dl>
    </aside>
  );
}

// Turn thread + conclusion outputs for the selected discussion topic
// (design-decision ritual read surface: proposal/final-stance turns in order,
// then the concluded outputs).
function DiscussionThread({
  model,
  topicId,
  locale,
  t
}: {
  model: AgentspaceDataModel;
  topicId: string;
  locale: AopsCockpitLocale;
  t: TFn;
}): ReactNode {
  const detailQuery = useAgentspaceDiscussionDetail({ model, topicId });
  if (detailQuery.isPending) return <p className="aops-pm-muted">{t("asLoadingMessage")}</p>;
  if (detailQuery.error) return <p className="aops-pm-error-line">{apiErrorMessage(detailQuery.error, "agentspace_unavailable")}</p>;
  const topic = detailQuery.data?.topic ?? model.discussions.find((row) => row.id === topicId) ?? null;
  const turns = (detailQuery.data?.turns ?? []).slice().sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const outputs = sortDiscussionOutputs(detailQuery.data?.outputs ?? []);
  const blockedAttention = topic ? discussionBlockedAttention(topic, t) : null;
  return (
    <div className="aops-as-thread">
      <h5 className="aops-as-thread-title">
        {t("asTurns")} <span className="aops-pm-mono">{turns.length}</span>
      </h5>
      {blockedAttention ? (
        <p className="aops-pm-error-line">
          {blockedAttention}
        </p>
      ) : null}
      {turns.length === 0 ? <p className="aops-pm-muted">{t("asNoTurns")}</p> : null}
      {turns.length ? (
        <div className="aops-as-turn-list">
          {turns.map((turn) => (
            <article className="aops-as-turn is-turn" key={turn.id}>
              <i className="aops-as-turn-dot" style={{ backgroundColor: discussionKindColor(turn.kind) }} aria-hidden />
              <header className="aops-as-turn-head">
                <span className="aops-pm-mono">#{turn.seq ?? "—"}</span>
                <b>{turn.agentId ?? "?"}</b>
                {turn.kind ? (
                  <span className={`eops-chip cp-chip-xs ${discussionKindChipClass(turn.kind)}`}>
                    {turn.kind}
                  </span>
                ) : null}
                {turn.replyToSeq != null ? <span className="eops-chip eops-chip--ghost cp-chip-xs">{t("asFieldReplyTo")} #{turn.replyToSeq}</span> : null}
                {turn.addressedTo ? <span className="eops-chip eops-chip--amber cp-chip-xs">{t("asFieldAddressedTo")}: {turn.addressedTo}</span> : null}
                <span className="aops-pm-muted">{formatPmDate(turn.createdAt, locale)}</span>
              </header>
              <div className="aops-as-turn-body">
                <MarkdownLite markdown={turn.text ?? ""} />
              </div>
            </article>
          ))}
        </div>
      ) : null}
      {outputs.length ? (
        <>
          <h5 className="aops-as-thread-title">{t("asOutputs")}</h5>
          <div className="aops-as-output-list">
            {outputs.map((output) => {
              const outputKind = output.outputKind ?? null;
              return (
                <article className={`aops-as-turn is-output is-output-${discussionOutputTone(outputKind)}`} key={output.id}>
                  <header className="aops-as-turn-head">
                    <span className={`eops-chip cp-chip-xs ${discussionOutputChipClass(outputKind)}`}>
                      {discussionOutputKindLabel(outputKind, t)}
                    </span>
                    {output.ownerAgentId ? (
                      <span className="eops-chip eops-chip--ghost cp-chip-xs">
                        {t("asFieldOutputOwner")}: {output.ownerAgentId}
                      </span>
                    ) : null}
                  </header>
                  <div className="aops-as-turn-body">
                    <MarkdownLite markdown={output.content ?? ""} />
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

// Current-version body for the selected prompt/skill (on-demand fetch; the
// list records carry only currentVersionId).
function AssetVersionBody({
  model,
  asset,
  versionId,
  t
}: {
  model: AgentspaceDataModel;
  asset: "prompt" | "skill";
  versionId: string | null;
  t: TFn;
}): ReactNode {
  const versionQuery = useAgentspaceAssetVersion({ model, asset, versionId });
  if (!versionId) return null;
  if (versionQuery.isPending) return <p className="aops-pm-muted">{t("asLoadingMessage")}</p>;
  if (versionQuery.error) {
    return <p className="aops-pm-error-line">{apiErrorMessage(versionQuery.error, "agentspace_unavailable")}</p>;
  }
  const version = versionQuery.data;
  const content = version?.content ?? version?.bodyMarkdown ?? "";
  if (!content && !version?.entryFile) return null;
  return (
    <div className="aops-as-versionbody">
      <h5 className="aops-as-thread-title">
        {t("asVersionBody")}
        {version?.version != null ? <span className="aops-pm-mono"> v{version.version}</span> : null}
        {version?.entryFile ? <span className="aops-pm-muted"> · {version.entryFile}</span> : null}
      </h5>
      <pre className="aops-as-versionbody-content">{content}</pre>
    </div>
  );
}

function firstLine(text: string | null | undefined, max = 96): string {
  const line = (text ?? "").trim().split("\n")[0] ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function rolesSummary(roles: Record<string, unknown> | null | undefined): string | null {
  if (!roles || typeof roles !== "object") return null;
  const entries = Object.entries(roles).filter(([, value]) => typeof value === "string");
  if (!entries.length) return null;
  return entries.map(([role, agent]) => `${role}: ${String(agent)}`).join(" · ");
}

function bulletList(rows: string[] | null | undefined): string {
  return (rows ?? []).map((row) => `• ${row}`).join("\n");
}

function buildMissionItems(rows: AgentspaceMission[], t: TFn): AgentspaceRecordItem[] {
  return rows.map((row) => {
    const policyRoles = rolesSummary(
      (row.policy as { roles?: Record<string, unknown> } | null)?.roles ?? row.roles
    );
    const refs = uniquePmRefs([
      pmRefFrom(
        row.activeImplementationPlanRef?.refType ?? "implementation-plan",
        row.activeImplementationPlanRef?.refId,
        row.activeImplementationPlanRef?.refId
          ? `${t("asFieldActivePlan")}: ${shortId(row.activeImplementationPlanRef.refId)}`
          : null
      ),
      ...(row.references ?? []).map((ref) => pmRefFrom(ref.refType, ref.refId, ref.title ?? ref.note ?? null))
    ]);
    return {
      id: row.id,
      title: row.slug ?? shortId(row.id),
      status: row.status ?? null,
      eyebrow: t("asSectionMissions"),
      refs,
      chips: row.activeImplementationPlanRef?.refId
        ? [{ label: `${t("asFieldActivePlan")}: ${shortId(row.activeImplementationPlanRef.refId)}`, tone: "indigo" as const }]
        : [],
      fields: [
        { label: t("asFieldSlug"), value: row.slug ?? null },
        { label: t("asFieldRoles"), value: policyRoles },
        {
          label: t("asFieldActivePlan"),
          value: row.activeImplementationPlanRef?.refId ? shortId(row.activeImplementationPlanRef.refId) : null
        }
      ],
      body: [
        { heading: t("asFieldObjective"), text: row.objective ?? "" },
        { heading: t("asFieldTaskDefinition"), text: row.taskDefinition ?? "" },
        { heading: t("asFieldSuccessCriteria"), text: bulletList(row.successCriteria) },
        { heading: t("asFieldConstraints"), text: bulletList(row.constraints) }
      ],
      searchText: `${row.slug ?? ""} ${row.objective ?? ""} ${row.status ?? ""}`,
      createdAt: (row as { createdAt?: string }).createdAt,
      updatedAt: (row as { updatedAt?: string }).updatedAt
    };
  });
}

function buildDiscussionItems(
  rows: AgentspaceDiscussionTopic[],
  locale: AopsCockpitLocale,
  t: TFn
): AgentspaceRecordItem[] {
  return rows.map((row) => {
    const blockedAttention = discussionBlockedAttention(row, t);
    return {
      id: row.id,
      title: row.title || row.slug || shortId(row.id),
      status: row.status ?? null,
      eyebrow: t("asSectionDiscussions"),
      refs: uniquePmRefs([
        pmRefFrom(row.subjectType, row.subjectId, row.subjectId ? `${row.subjectType ?? "ref"} · ${shortId(row.subjectId)}` : null)
      ]),
      chips: [
        ...(blockedAttention ? [{ label: blockedAttention, tone: "coral" as const }] : []),
        ...(row.participants?.length ? [{ label: `${row.participants.length}× ${t("asFieldParticipants")}` }] : []),
        ...(row.lastSeq != null ? [{ label: `${t("asFieldLastSeq")} #${row.lastSeq}` }] : []),
        ...(row.subjectType ? [{ label: row.subjectType }] : [])
      ],
      fields: [
        { label: t("asFieldSlug"), value: row.slug ?? null },
        { label: t("asFieldParticipants"), value: row.participants?.join(", ") ?? null },
        { label: t("asFieldLastSeq"), value: row.lastSeq != null ? `#${row.lastSeq}` : null },
        { label: t("asFieldRules"), value: formatDiscussionRules(row.rules, t) },
        ...(blockedAttention ? [{ label: t("asAttentionBlocked"), value: blockedAttention }] : []),
        { label: t("asFieldLastTurn"), value: row.lastTurnAt ? formatPmDate(row.lastTurnAt, locale) : null }
      ],
      body: [{ heading: t("asFieldQuestion"), text: row.question ?? "" }],
      tags: row.tags ?? undefined,
      searchText: `${row.title ?? ""} ${row.slug ?? ""} ${row.question ?? ""} ${row.status ?? ""} ${blockedAttention ?? ""} ${(row.participants ?? []).join(" ")}`,
      createdAt: (row as { createdAt?: string }).createdAt,
      updatedAt: (row as { updatedAt?: string }).updatedAt ?? row.lastTurnAt ?? undefined
    };
  });
}

function formatDiscussionRules(row: AgentspaceDiscussionTopic["rules"], t: TFn): string | null {
  if (!row) return null;
  const parts = [
    row.turnOrder?.length ? `${t("asDiscussionTurnOrder")}: ${row.turnOrder.join(" -> ")}` : null,
    row.minTurnsBeforeConclude != null ? `${t("asDiscussionMinTurns")}: ${row.minTurnsBeforeConclude}` : null,
    row.requireQuestionAnswer ? t("asDiscussionRequireQuestionAnswer") : null
  ].filter(Boolean);
  return parts.length ? parts.join(" | ") : null;
}

function buildAssetItems(
  rows: Array<AgentspacePrompt | AgentspaceSkill>,
  kind: "prompts" | "skills",
  locale: AopsCockpitLocale,
  t: TFn
): AgentspaceRecordItem[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.name ?? shortId(row.id),
    status: row.status ?? null,
    eyebrow: kind === "prompts" ? t("asSectionPrompts") : t("asSectionSkills"),
    chips: [],
    fields: [
      {
        label: t("asFieldDescription"),
        value: ("shortDescription" in row ? row.shortDescription : null) ?? row.description ?? null
      },
      { label: t("asFieldCurrentVersion"), value: row.currentVersionId ? shortId(row.currentVersionId) : null },
      { label: t("asFieldUpdated"), value: formatPmDate(row.updatedAt, locale) }
    ],
    tags: row.tags ?? undefined,
    searchText: `${row.name ?? ""} ${row.description ?? ""} ${(row.tags ?? []).join(" ")}`,
    createdAt: (row as { createdAt?: string }).createdAt,
    updatedAt: row.updatedAt
  }));
}

function formatBytes(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function buildArtifactItems(rows: AgentspaceArtifact[], locale: AopsCockpitLocale, t: TFn): AgentspaceRecordItem[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.label ?? row.storagePath?.split(/[\\/]/).pop() ?? shortId(row.id),
    status: row.artifactType ?? null,
    eyebrow: t("asSectionArtifacts"),
    refs: uniquePmRefs((row.links ?? []).map((link) => pmRefFrom(link.refType, link.refId))),
    chips: [
      ...(row.mimeType ? [{ label: row.mimeType }] : []),
      ...((row.links ?? []).slice(0, 1).map((link) => ({ label: link.refType ?? "ref", tone: "indigo" as const })))
    ],
    fields: [
      { label: t("asFieldArtifactType"), value: row.artifactType ?? null },
      { label: t("asFieldMimeType"), value: row.mimeType ?? null },
      { label: t("asFieldSize"), value: formatBytes(row.sizeBytes) },
      {
        label: t("asFieldRef"),
        value: (row.links ?? [])
          .map((link) => `${link.refType ?? "ref"} · ${link.refId ? shortId(link.refId) : "?"}`)
          .join(", ") || null
      },
      { label: t("asFieldStoragePath"), value: row.storagePath ?? null },
      { label: t("asFieldUpdated"), value: formatPmDate(row.updatedAt, locale) }
    ],
    searchText: `${row.label ?? ""} ${row.artifactType ?? ""} ${row.mimeType ?? ""} ${row.storagePath ?? ""}`,
    createdAt: (row as { createdAt?: string }).createdAt,
    updatedAt: row.updatedAt
  }));
}

function buildResourceItems(rows: AgentspaceResource[], locale: AopsCockpitLocale, t: TFn): AgentspaceRecordItem[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.name ?? shortId(row.id),
    status: row.resourceType ?? null,
    eyebrow: t("asSectionResources"),
    refs: uniquePmRefs([pmRefFrom(row.refType, row.refId)]),
    chips: row.refType ? [{ label: row.refType, tone: "indigo" as const }] : [],
    fields: [
      { label: t("asFieldResourceType"), value: row.resourceType ?? null },
      { label: t("asFieldRef"), value: row.refId ? `${row.refType ?? "ref"} · ${shortId(row.refId)}` : null },
      { label: t("asFieldUri"), value: row.uri ?? null },
      { label: t("asFieldDescription"), value: row.description ?? null },
      { label: t("asFieldUpdated"), value: formatPmDate(row.updatedAt, locale) }
    ],
    tags: row.tags ?? undefined,
    searchText: `${row.name ?? ""} ${row.resourceType ?? ""} ${row.uri ?? ""} ${(row.tags ?? []).join(" ")}`,
    createdAt: (row as { createdAt?: string }).createdAt,
    updatedAt: row.updatedAt
  }));
}

function buildAgentItems(rows: AgentspaceAgentProfile[], t: TFn): AgentspaceRecordItem[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.name ?? row.slug ?? shortId(row.id),
    status: row.kind ?? null,
    eyebrow: t("asSectionAgents"),
    chips: row.role ? [{ label: row.role, tone: "indigo" as const }] : [],
    fields: [
      { label: t("asFieldSlug"), value: row.slug ?? null },
      { label: t("asFieldRole"), value: row.role ?? null },
      { label: t("asFieldCapabilities"), value: row.capabilities?.join(", ") ?? null }
    ],
    body: row.body ? [{ heading: t("asSectionAgents"), text: row.body }] : undefined,
    tags: row.tags ?? undefined,
    searchText: `${row.name ?? ""} ${row.slug ?? ""} ${row.role ?? ""}`,
    createdAt: (row as { createdAt?: string }).createdAt,
    updatedAt: (row as { updatedAt?: string }).updatedAt
  }));
}
