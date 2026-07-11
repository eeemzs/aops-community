import type { AopsCockpitLocale, AopsCockpitTranslationKey } from "../../lib/i18n";
import type {
  CockpitPmPhase,
  CockpitPmProgress,
  CockpitPmTask,
  PmBoardColumnView,
  ProjectmanDataModel
} from "../../lib/projectman";
import type { ProjectmanSectionId } from "../../lib/sections";
import type { ProjectsPageModel } from "../ProjectsPage";
import type { BoardsNavigator } from "../../lib/boardsNavigator";
import type { SprintsNavigator } from "../../lib/sprintsNavigator";

export type TFn = (key: AopsCockpitTranslationKey) => string;
export type ProjectmanViewId = "overview" | "tasks" | "boards" | "sprintsPlans";
export type ArchiveFilter = "active" | "archived";
export type BoardMode = "kanban" | "table";
export type PlanKind = "sprint" | "plan";
export type PlanFilter = "all" | PlanKind;

export interface ProjectmanPageProps {
  model: ProjectmanDataModel;
  /** Active UI locale — date formatting in tables (chat-page idiom). */
  locale: AopsCockpitLocale;
  t: TFn;
}

/** A2 dispatcher props: the base view props + the band/section routing. */
export interface ProjectmanDispatcherProps extends ProjectmanPageProps {
  /** Projects registry model — drives the project-dropdown band. */
  projects: ProjectsPageModel;
  /** Boards navigator (left-menu / navigator / dropdown modes). */
  boardsNavigator: BoardsNavigator;
  /** Selected board id (owned at App level, drives the boards navigator). */
  selectedBoardId: string | null;
  /** Sprints navigator (left-menu / navigator / dropdown modes). */
  sprintsNavigator: SprintsNavigator;
  /** Selected sprint/plan key (owned at App level). */
  selectedSprintKey: string | null;
  /** Active dispatcher section, derived from the routed page id. */
  section: ProjectmanSectionId;
  /** Switch section (routes to the section's page id, syncing the left menu). */
  onNavigate: (pageId: string) => void;
}

/** Boards-section view props: base + the boards navigator + selection. */
export interface ProjectmanBoardsProps extends ProjectmanPageProps {
  navigator: BoardsNavigator;
  selectedBoardId: string | null;
}

/** Sprints-section view props: base + the sprints navigator + selection. */
export interface ProjectmanSprintsProps extends ProjectmanPageProps {
  navigator: SprintsNavigator;
  selectedKey: string | null;
}

export interface TaskWithMeta {
  task: CockpitPmTask;
  boardName: string;
  sprintName: string;
  column: PmBoardColumnView | null;
  statusLabel: string;
}

export interface PlanRecordItem {
  key: string;
  id: string;
  kind: PlanKind;
  name: string;
  status?: string | null;
  goal?: string | null;
  taskId?: string | null;
  archived: boolean;
  updatedAt?: string;
  createdAt?: string;
}

export interface NormalizedPlanDetail {
  id: string;
  kind: PlanKind;
  name: string;
  status?: string | null;
  goal?: string | null;
  taskId?: string | null;
  scope: string[];
  validationPlan: string[];
  references: string[];
  phases: CockpitPmPhase[];
  progress?: CockpitPmProgress | null;
}
