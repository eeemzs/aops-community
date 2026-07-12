import { Effect } from 'effect'
import { ProjectMemberServiceError } from '../../errors/ProjectMemberServiceError.js'
import { IbmProjectMember, IbmProjectMemberInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'

export interface IProjectMemberServicePort {
  getById(id: string, options?: DbQueryOptions<IbmProjectMember>): Effect.Effect<IbmProjectMember | null, ProjectMemberServiceError>
  create(data: IbmProjectMemberInsert): Effect.Effect<IbmProjectMember, ProjectMemberServiceError>
  listProjectMembers(
    filter?: Partial<IbmProjectMember>,
    options?: DbQueryOptions<IbmProjectMember>
  ): Effect.Effect<IbmProjectMember[], ProjectMemberServiceError>
  updateProjectMember(id: string, patch: Partial<IbmProjectMember>): Effect.Effect<IbmProjectMember, ProjectMemberServiceError>
  removeProjectMember(id: string): Effect.Effect<void, ProjectMemberServiceError>
}

export interface IProjectMemberLookupPort {
  getById(id: string): Effect.Effect<IbmProjectMember | null, ProjectMemberServiceError>
}
