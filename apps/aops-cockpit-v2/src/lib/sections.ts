import type { AopsCockpitTranslationKey } from "./i18n";

/**
 * Cockpit sections are now ORGANIZATIONAL groupings only — their nav items are
 * flattened into a single unified left menu (eops-desktop mechanic), with no
 * top-level header section switch. `allCockpitNavItems()` does the flattening;
 * App.tsx localizes the labels via the translator. Sections (projects / pm /
 * sessions; further: agentspace / docman / mem) just keep related nav items
 * together in source order.
 */
export type CockpitSection = "projects" | "pm" | "agentspace" | "docs" | "sessions";

export interface CockpitNavDef {
  /** Page id resolved by the ui-plugin registry. */
  id: string;
  /** i18n key, or use `label` for a literal (e.g. demo/test items). */
  labelKey?: AopsCockpitTranslationKey;
  label?: string;
  /** DESKTOP_SHELL_ICONS key (top-level items only). */
  icon?: string;
  /** Nested sub-navigation (2nd / 3rd level). */
  children?: CockpitNavDef[];
}

export interface CockpitSectionDef {
  id: CockpitSection;
  /** i18n key for the segmented section label. */
  label: AopsCockpitTranslationKey;
  navItems: CockpitNavDef[];
  /** Page id selected when the section becomes active. */
  defaultPageId: string;
}

/**
 * PM is an A2 multi-tab dispatcher: one page id per section, exposed BOTH as
 * two-level left-menu children (PM ▸ …) and as in-page section tabs, kept in
 * sync via the single active page id. `section` is the dispatcher's internal
 * view key; `id` is the routed page id.
 */
export type ProjectmanSectionId =
  | "boards"
  | "sprints"
  | "issues"
  | "feedback"
  | "reviews";

export interface ProjectmanSectionDef {
  id: string;
  section: ProjectmanSectionId;
  labelKey: AopsCockpitTranslationKey;
}

export const PROJECTMAN_SECTIONS: ProjectmanSectionDef[] = [
  { id: "pm-boards", section: "boards", labelKey: "pmSectionBoards" },
  { id: "pm-sprints", section: "sprints", labelKey: "pmSectionSprints" },
  { id: "pm-issues", section: "issues", labelKey: "pmSectionIssues" },
  { id: "pm-feedback", section: "feedback", labelKey: "pmSectionFeedback" },
  { id: "pm-reviews", section: "reviews", labelKey: "pmSectionReviews" }
];

/** Default PM landing page id (first section). */
export const PROJECTMAN_DEFAULT_PAGE_ID = PROJECTMAN_SECTIONS[0].id;

export function projectmanSectionForPage(pageId: string): ProjectmanSectionId {
  return (
    PROJECTMAN_SECTIONS.find((entry) => entry.id === pageId)?.section ??
    PROJECTMAN_SECTIONS[0].section
  );
}

export function projectmanPageIdForSection(section: ProjectmanSectionId): string {
  return PROJECTMAN_SECTIONS.find((entry) => entry.section === section)?.id ?? PROJECTMAN_DEFAULT_PAGE_ID;
}

export function isProjectmanPage(pageId: string): boolean {
  return PROJECTMAN_SECTIONS.some((entry) => entry.id === pageId);
}

/**
 * Agentspace mirrors the PM A2 dispatcher: one page id per section, exposed as
 * two-level left-menu children (AGENTSPACE ▸ …) and as in-page section tabs,
 * synced via the single active page id.
 */
export type AgentspaceSectionId =
  | "memory"
  | "missions"
  | "discussions"
  | "prompts"
  | "skills"
  | "artifacts"
  | "resources"
  | "agents";

export interface AgentspaceSectionDef {
  id: string;
  section: AgentspaceSectionId;
  labelKey: AopsCockpitTranslationKey;
}

export const AGENTSPACE_SECTIONS: AgentspaceSectionDef[] = [
  { id: "as-memory", section: "memory", labelKey: "asSectionMemory" },
  { id: "as-missions", section: "missions", labelKey: "asSectionMissions" },
  { id: "as-discussions", section: "discussions", labelKey: "asSectionDiscussions" },
  { id: "as-prompts", section: "prompts", labelKey: "asSectionPrompts" },
  { id: "as-skills", section: "skills", labelKey: "asSectionSkills" },
  { id: "as-artifacts", section: "artifacts", labelKey: "asSectionArtifacts" },
  { id: "as-resources", section: "resources", labelKey: "asSectionResources" },
  { id: "as-agents", section: "agents", labelKey: "asSectionAgents" }
];

export const AGENTSPACE_DEFAULT_PAGE_ID = AGENTSPACE_SECTIONS[0].id;

export function agentspaceSectionForPage(pageId: string): AgentspaceSectionId {
  return (
    AGENTSPACE_SECTIONS.find((entry) => entry.id === pageId)?.section ??
    AGENTSPACE_SECTIONS[0].section
  );
}

export function agentspacePageIdForSection(section: AgentspaceSectionId): string {
  return AGENTSPACE_SECTIONS.find((entry) => entry.section === section)?.id ?? AGENTSPACE_DEFAULT_PAGE_ID;
}

export function isAgentspacePage(pageId: string): boolean {
  return AGENTSPACE_SECTIONS.some((entry) => entry.id === pageId);
}

export const COCKPIT_SECTIONS: CockpitSectionDef[] = [
  {
    id: "projects",
    label: "navProjects",
    navItems: [{ id: "projects", labelKey: "navProjects", icon: "stack" }],
    defaultPageId: "projects"
  },
  {
    id: "pm",
    label: "navProjectman",
    // Two-level menu: PM parent (group, not directly navigable) ▸ 5 sections.
    navItems: [
      {
        id: "projectman",
        labelKey: "navProjectman",
        icon: "board",
        children: PROJECTMAN_SECTIONS.map((entry) => ({ id: entry.id, labelKey: entry.labelKey }))
      }
    ],
    defaultPageId: PROJECTMAN_DEFAULT_PAGE_ID
  },
  {
    id: "agentspace",
    label: "navAgentspace",
    // Two-level menu: AGENTSPACE parent (group) ▸ 7 sections.
    navItems: [
      {
        id: "agentspace",
        labelKey: "navAgentspace",
        icon: "spark",
        children: AGENTSPACE_SECTIONS.map((entry) => ({ id: entry.id, labelKey: entry.labelKey }))
      }
    ],
    defaultPageId: AGENTSPACE_DEFAULT_PAGE_ID
  },
  {
    id: "docs",
    label: "navDocs",
    navItems: [{ id: "docs", labelKey: "navDocs", icon: "doc" }],
    defaultPageId: "docs"
  },
  {
    id: "sessions",
    label: "navSessions",
    navItems: [{ id: "chat", labelKey: "navChat", icon: "chat" }],
    defaultPageId: "chat"
  }
];

export function cockpitSectionDef(id: CockpitSection): CockpitSectionDef {
  return COCKPIT_SECTIONS.find((section) => section.id === id) ?? COCKPIT_SECTIONS[0];
}

/**
 * Flattened single-menu nav (eops-desktop mechanic): every section's nav items
 * concatenated into ONE left sidebar list, in section order. There is no
 * top-level section switch — the sidebar is the only navigation surface, and a
 * nav item id IS the active page id.
 */
export function allCockpitNavItems(): CockpitNavDef[] {
  return COCKPIT_SECTIONS.flatMap((section) => section.navItems);
}

/** First nav item's page id — the cockpit's default landing page. */
export function defaultCockpitPageId(): string {
  return allCockpitNavItems()[0]?.id ?? "projects";
}

/** Keep section + page in sync (e.g. after a persisted reload). */
export function sectionForPage(pageId: string): CockpitSection {
  const matches = (item: CockpitNavDef): boolean =>
    item.id === pageId || (item.children?.some(matches) ?? false);
  return (
    COCKPIT_SECTIONS.find((section) => section.navItems.some(matches))?.id ?? "projects"
  );
}
