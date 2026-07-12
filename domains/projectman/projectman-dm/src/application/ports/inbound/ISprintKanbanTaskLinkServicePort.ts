import { Effect } from 'effect'
import { DbQueryOptions } from '@aopslab/xf-db'
import { SprintKanbanTaskLinkServiceError } from '../../errors/SprintKanbanTaskLinkServiceError.js'
import { IbmSprintKanbanTaskLink, IbmSprintKanbanTaskLinkInsert } from '../../../domain/models/index.js'

export type SprintKanbanTaskLinkCreateInput = IbmSprintKanbanTaskLinkInsert

export interface ISprintKanbanTaskLinkServicePort {
  getById(id: string, options?: DbQueryOptions<IbmSprintKanbanTaskLink>): Effect.Effect<IbmSprintKanbanTaskLink | null, SprintKanbanTaskLinkServiceError>
  create(data: IbmSprintKanbanTaskLinkInsert): Effect.Effect<IbmSprintKanbanTaskLink, SprintKanbanTaskLinkServiceError>
  createLink(input: SprintKanbanTaskLinkCreateInput): Effect.Effect<IbmSprintKanbanTaskLink, SprintKanbanTaskLinkServiceError>
  linkTaskToSprint(input: SprintKanbanTaskLinkCreateInput): Effect.Effect<IbmSprintKanbanTaskLink, SprintKanbanTaskLinkServiceError>
  unlinkTaskFromSprint(sprintId: string, kanbanTaskId: string): Effect.Effect<number, SprintKanbanTaskLinkServiceError>
  listLinks(filter?: Partial<IbmSprintKanbanTaskLink>, options?: DbQueryOptions<IbmSprintKanbanTaskLink>): Effect.Effect<IbmSprintKanbanTaskLink[], SprintKanbanTaskLinkServiceError>
  //==> custom-methods
  //<==//
}

export interface ISprintKanbanTaskLinkLookupPort {
  getById(id: string): Effect.Effect<IbmSprintKanbanTaskLink | null, SprintKanbanTaskLinkServiceError>
}
