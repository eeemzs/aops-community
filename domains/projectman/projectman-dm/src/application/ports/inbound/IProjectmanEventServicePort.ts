import { Effect } from 'effect'
import { DbQueryOptions } from '@aopslab/xf-db'
import { ProjectmanEventServiceError } from '../../errors/ProjectmanEventServiceError.js'
import { IbmProjectmanEvent, IbmProjectmanEventInsert } from '../../../domain/models/index.js'

export type ProjectmanEventCreateInput = IbmProjectmanEventInsert

export interface IProjectmanEventServicePort {
  getById(id: string, options?: DbQueryOptions<IbmProjectmanEvent>): Effect.Effect<IbmProjectmanEvent | null, ProjectmanEventServiceError>
  create(data: IbmProjectmanEventInsert): Effect.Effect<IbmProjectmanEvent, ProjectmanEventServiceError>
  createEvent(input: ProjectmanEventCreateInput): Effect.Effect<IbmProjectmanEvent, ProjectmanEventServiceError>
  listEvents(filter?: Partial<IbmProjectmanEvent>, options?: DbQueryOptions<IbmProjectmanEvent>): Effect.Effect<IbmProjectmanEvent[], ProjectmanEventServiceError>
  removeEvent(id: string): Effect.Effect<void, ProjectmanEventServiceError>
  //==> custom-methods
  //<==//
}

export interface IProjectmanEventLookupPort {
  getById(id: string): Effect.Effect<IbmProjectmanEvent | null, ProjectmanEventServiceError>
}
