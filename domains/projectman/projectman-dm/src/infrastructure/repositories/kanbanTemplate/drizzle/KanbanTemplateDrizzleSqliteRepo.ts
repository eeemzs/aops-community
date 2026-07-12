import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmKanbanTemplate } from '../../../../domain/models/index.js'
import { IRepositoryPortKanbanTemplate } from '../../../../application/ports/repository-ports/index.js'
import { IdbKanbanTemplateDrizzleSqlite, kanbanTemplateTableSqlite } from '../../../db/kanbanTemplate/drizzle/drizzle.schema.kanbanTemplate.sqlite.js'
import { mapperKanbanTemplateDrizzle } from '../../../db/kanbanTemplate/drizzle/drizzle.mapper.kanbanTemplate.js'

export class KanbanTemplateDrizzleSqliteRepo
  extends DraBaseSqlite<IbmKanbanTemplate, IdbKanbanTemplateDrizzleSqlite, typeof kanbanTemplateTableSqlite>
  implements IRepositoryPortKanbanTemplate
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(kanbanTemplateTableSqlite, { mapper: mapperKanbanTemplateDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
