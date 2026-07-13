import type { ReactNode } from "react";
import { createUiPluginRegistry, defineUiPlugin } from "@aopslab/xf-ui-plugin";
import { ProjectmanPage } from "../pages/ProjectmanPage";
import { ProjectsPage } from "../pages/ProjectsPage";
import { ChatPage } from "../pages/ChatPage";
import { AgentspacePage } from "../pages/AgentspacePage";
import { DocsPage } from "../pages/DocsPage";
import type { AopsCockpitLocale, AopsCockpitTranslationKey } from "../lib/i18n";
import type { ProjectmanDataModel } from "../lib/projectman";
import type { ProjectsNavigator } from "../lib/projectsNavigator";
import type { ProjectsPageModel } from "../pages/ProjectsPage";
import type { ChatSession } from "../lib/chat";
import type { ChatNavigator } from "../lib/chatNavigator";
import type { BoardsNavigator } from "../lib/boardsNavigator";
import type { SprintsNavigator } from "../lib/sprintsNavigator";
import type { AgentspaceDataModel } from "../lib/agentspace";
import type { DocmanDataModel } from "../lib/docman";
import type { DocsNavigator } from "../lib/docsNavigator";
import type { ProjectmanRefTarget } from "../lib/projectmanRefs";
import {
  AGENTSPACE_SECTIONS,
  agentspaceSectionForPage,
  PROJECTMAN_SECTIONS,
  projectmanSectionForPage
} from "../lib/sections";

export const AOPS_COCKPIT_PAGE_IDS = [
  "projects",
  "pm-boards",
  "pm-sprints",
  "pm-issues",
  "pm-feedback",
  "pm-reviews",
  "as-memory",
  "as-missions",
  "as-discussions",
  "as-prompts",
  "as-skills",
  "as-artifacts",
  "as-resources",
  "as-agents",
  "docs",
  "chat"
] as const;
export type AopsCockpitPageId = (typeof AOPS_COCKPIT_PAGE_IDS)[number];

export interface AopsCockpitPluginContext {
  activePageId: string;
  t: (key: AopsCockpitTranslationKey) => string;
  locale: AopsCockpitLocale;
  projects: ProjectsPageModel;
  projectsNavigator: ProjectsNavigator;
  projectman: ProjectmanDataModel;
  boardsNavigator: BoardsNavigator;
  selectedBoardId: string | null;
  sprintsNavigator: SprintsNavigator;
  selectedSprintKey: string | null;
  chat: ChatSession;
  chatNavigator: ChatNavigator;
  agentspace: AgentspaceDataModel;
  docman: DocmanDataModel;
  docsNavigator: DocsNavigator;
  selectedDocumentId: string | null;
  onNavigate: (pageId: string) => void;
  onOpenPlan: (planId: string) => void;
  onOpenProjectmanRef: (target: ProjectmanRefTarget) => void;
}

const renderProjectman = (context: AopsCockpitPluginContext) => (
  <ProjectmanPage
    model={context.projectman}
    projects={context.projects}
    boardsNavigator={context.boardsNavigator}
    selectedBoardId={context.selectedBoardId}
    sprintsNavigator={context.sprintsNavigator}
    selectedSprintKey={context.selectedSprintKey}
    section={projectmanSectionForPage(context.activePageId)}
    onNavigate={context.onNavigate}
    locale={context.locale}
    t={context.t}
  />
);
const projectmanPages = PROJECTMAN_SECTIONS.map((entry) => ({
  id: entry.id,
  nav: { label: entry.id, icon: "projectman", order: 20 },
  render: renderProjectman
}));

const renderAgentspace = (context: AopsCockpitPluginContext) => (
  <AgentspacePage
    model={context.agentspace}
    section={agentspaceSectionForPage(context.activePageId)}
    onNavigate={context.onNavigate}
    onOpenPlan={context.onOpenPlan}
    onOpenProjectmanRef={context.onOpenProjectmanRef}
    locale={context.locale}
    t={context.t}
  />
);
const agentspacePages = AGENTSPACE_SECTIONS.map((entry) => ({
  id: entry.id,
  nav: { label: entry.id, icon: "agentspace", order: 25 },
  render: renderAgentspace
}));

function assertExactPageRegistry(actual: readonly string[]): void {
  const expected = [...AOPS_COCKPIT_PAGE_IDS].sort();
  const observed = [...actual].sort();
  if (
    observed.length !== expected.length ||
    observed.some((pageId, index) => pageId !== expected[index])
  ) {
    throw new Error(
      `community_cockpit_registry_mismatch:expected=${expected.join(",")}:actual=${observed.join(",")}`
    );
  }
}

export const AOPS_COCKPIT_DEFAULT_PAGE_ID: AopsCockpitPageId = "projects";

const cockpitPages = [
    {
      id: AOPS_COCKPIT_DEFAULT_PAGE_ID,
      nav: { label: "Projects", icon: "projects", order: 10 },
      render: (context: AopsCockpitPluginContext) => (
        <ProjectsPage
          model={context.projects}
          navigator={context.projectsNavigator}
          projectman={context.projectman}
          agentspace={context.agentspace}
          docman={context.docman}
          onNavigate={context.onNavigate}
          onOpenPlan={context.onOpenPlan}
          locale={context.locale}
          t={context.t}
        />
      )
    },
    ...projectmanPages,
    ...agentspacePages,
    {
      id: "docs",
      nav: { label: "Docs", icon: "docs", order: 28 },
      render: (context: AopsCockpitPluginContext) => (
        <DocsPage
          model={context.docman}
          navigator={context.docsNavigator}
          selectedDocumentId={context.selectedDocumentId}
          locale={context.locale}
          t={context.t}
        />
      )
    },
    {
      id: "chat",
      nav: { label: "Chat", icon: "chat", order: 30 },
      render: (context: AopsCockpitPluginContext) => (
        <ChatPage
          model={context.chat}
          navigator={context.chatNavigator}
          locale={context.locale}
          t={context.t}
        />
      )
    }
  ];
assertExactPageRegistry(cockpitPages.map((page) => page.id));

const aopsCockpitPlugin = defineUiPlugin<AopsCockpitPluginContext>({
  id: "aops-cockpit-v2-core",
  pages: cockpitPages
});

export const cockpitPluginRegistry = createUiPluginRegistry<AopsCockpitPluginContext>({
  plugins: [aopsCockpitPlugin]
});

export function renderCockpitPage(
  pageId: string,
  context: AopsCockpitPluginContext
): ReactNode {
  return cockpitPluginRegistry.renderPage(pageId, context) as ReactNode;
}
