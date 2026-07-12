import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmKanbanTemplate } from '../../../../domain/models/index.js'
import { IRepositoryPortKanbanTemplate } from '../../../../application/ports/repository-ports/index.js'
import { IdbKanbanTemplateDrizzle, kanbanTemplateTable } from '../../../db/kanbanTemplate/drizzle/drizzle.schema.kanbanTemplate.js'
import { mapperKanbanTemplateDrizzle } from '../../../db/kanbanTemplate/drizzle/drizzle.mapper.kanbanTemplate.js'

export class KanbanTemplateDrizzleRepo extends DraBase<IbmKanbanTemplate, IdbKanbanTemplateDrizzle, typeof kanbanTemplateTable> implements IRepositoryPortKanbanTemplate {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(kanbanTemplateTable, { mapper: mapperKanbanTemplateDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here.
  //<==//
}
