import { Effect } from 'effect'
import { DbQueryOptions } from '@aopslab/xf-db'
import { KanbanTemplateServiceError } from '../../errors/KanbanTemplateServiceError.js'
import { IbmKanbanTemplate, IbmKanbanTemplateInsert } from '../../../domain/models/index.js'

export type KanbanTemplateCreateInput = IbmKanbanTemplateInsert

export type KanbanTemplateApplyResult = {
  boardIds: string[]
  columnIds: string[]
  boardColumnIds: string[]
}

export interface IKanbanTemplateServicePort {
  getById(id: string, options?: DbQueryOptions<IbmKanbanTemplate>): Effect.Effect<IbmKanbanTemplate | null, KanbanTemplateServiceError>
  create(data: IbmKanbanTemplateInsert): Effect.Effect<IbmKanbanTemplate, KanbanTemplateServiceError>
  createTemplate(input: KanbanTemplateCreateInput): Effect.Effect<IbmKanbanTemplate, KanbanTemplateServiceError>
  updateTemplate(id: string, patch: Partial<IbmKanbanTemplate>): Effect.Effect<IbmKanbanTemplate, KanbanTemplateServiceError>
  listTemplates(filter?: Partial<IbmKanbanTemplate>, options?: DbQueryOptions<IbmKanbanTemplate>): Effect.Effect<IbmKanbanTemplate[], KanbanTemplateServiceError>
  applyTemplateToProject(templateId: string, projectId: string): Effect.Effect<KanbanTemplateApplyResult, KanbanTemplateServiceError>
  removeTemplate(id: string): Effect.Effect<void, KanbanTemplateServiceError>
  //==> custom-methods
  //<==//
}

export interface IKanbanTemplateLookupPort {
  getById(id: string): Effect.Effect<IbmKanbanTemplate | null, KanbanTemplateServiceError>
}
