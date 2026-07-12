import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmSkillVersion } from '../../../domain/models/index.js'
import { IdbSkillVersionDrizzle } from '../../../infrastructure/db/skillVersion/drizzle/drizzle.schema.skillVersion.js'

/**
 * Repository port for SkillVersion
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortSkillVersion extends IRepositoryPortBaseCrud<IbmSkillVersion, IdbSkillVersionDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmSkillVersion>): import('effect').Effect<IbmSkillVersion | null, RepositoryError>
  //<==//
}


