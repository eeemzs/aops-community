import { createRepositoryFactory } from '@aopslab/xf-dm'
import { IRepositoryPortKanbanTemplate } from '../ports/repository-ports/index.js'
import { KanbanTemplateDrizzleRepo, KanbanTemplateDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { inferDrizzleDialectFromRepositoryConfig } from './drizzleDialect.js'

const kanbanTemplatePgFactory = createRepositoryFactory<IRepositoryPortKanbanTemplate>({
  moduleName: 'RepositoryFactoryKanbanTemplate',
  mongoRepo: undefined,
  drizzleRepo: KanbanTemplateDrizzleRepo,
});

const kanbanTemplateSqliteFactory = createRepositoryFactory<IRepositoryPortKanbanTemplate>({
  moduleName: 'RepositoryFactoryKanbanTemplateSqlite',
  mongoRepo: undefined,
  drizzleRepo: KanbanTemplateDrizzleSqliteRepo,
});

export const RepositoryFactoryKanbanTemplate = {
  create(params: Parameters<typeof kanbanTemplatePgFactory.create>[0]) {
    const dialect = inferDrizzleDialectFromRepositoryConfig(params.repositoryConfig)
    return (dialect === 'sqlite' ? kanbanTemplateSqliteFactory : kanbanTemplatePgFactory).create(params)
  },
}
