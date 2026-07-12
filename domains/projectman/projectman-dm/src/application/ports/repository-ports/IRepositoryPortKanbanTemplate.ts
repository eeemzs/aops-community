import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmKanbanTemplate } from '../../../domain/models/index.js'
import { IdbKanbanTemplateDrizzle } from '../../../infrastructure/db/kanbanTemplate/drizzle/drizzle.schema.kanbanTemplate.js'

/**
 * Repository port for KanbanTemplate
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortKanbanTemplate extends IRepositoryBaseCrud<IbmKanbanTemplate, IdbKanbanTemplateDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here.
  //<==//
}
