import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmProjectMember } from '../../../domain/models/index.js'
import { IdbProjectMemberDrizzle } from '../../../infrastructure/db/projectMember/drizzle/drizzle.schema.projectMember.js'

/**
 * Repository port for ProjectMember
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortProjectMember extends IRepositoryPortBaseCrud<IbmProjectMember, IdbProjectMemberDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmProjectMember>): import('effect').Effect<IbmProjectMember | null, RepositoryError>
  //<==//
}

