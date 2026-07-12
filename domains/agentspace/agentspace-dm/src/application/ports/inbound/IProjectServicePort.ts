import { Effect } from 'effect'
import { ProjectServiceError } from '../../errors/ProjectServiceError.js'
import { IbmProject, IbmProjectInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'

export interface IProjectServicePort {
  getById(id: string, options?: DbQueryOptions<IbmProject>): Effect.Effect<IbmProject | null, ProjectServiceError>
  create(data: IbmProjectInsert): Effect.Effect<IbmProject, ProjectServiceError>
  getProject(id: string, options?: DbQueryOptions<IbmProject>): Effect.Effect<IbmProject | null, ProjectServiceError>
  listProjects(
    filter?: Partial<IbmProject>,
    options?: DbQueryOptions<IbmProject>
  ): Effect.Effect<IbmProject[], ProjectServiceError>
  updateProject(id: string, patch: Partial<IbmProject>): Effect.Effect<IbmProject, ProjectServiceError>
  setProjectType(id: string, projectType: IbmProject['projectType']): Effect.Effect<IbmProject, ProjectServiceError>
  setProjectVisibility(id: string, visibility: IbmProject['visibility']): Effect.Effect<IbmProject, ProjectServiceError>
  archiveProject(id: string): Effect.Effect<IbmProject, ProjectServiceError>
  removeProject(id: string): Effect.Effect<void, ProjectServiceError>
}

export interface IProjectLookupPort {
  getById(id: string): Effect.Effect<IbmProject | null, ProjectServiceError>
}
