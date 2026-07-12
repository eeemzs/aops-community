import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmSkill } from '../../../domain/models/index.js'
import { IdbSkillDrizzle } from '../../../infrastructure/db/skill/drizzle/drizzle.schema.skill.js'

/**
 * Repository port for Skill
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortSkill extends IRepositoryPortBaseCrud<IbmSkill, IdbSkillDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmSkill>): import('effect').Effect<IbmSkill | null, RepositoryError>
  //<==//
}


