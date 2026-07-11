export type ProjectmanRefKind = "board" | "task" | "sprint";

export interface ProjectmanRefTarget {
  kind: ProjectmanRefKind;
  id: string;
  boardId?: string | null;
}
