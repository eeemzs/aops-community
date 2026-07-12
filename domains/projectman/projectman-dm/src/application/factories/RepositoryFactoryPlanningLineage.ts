import { createRepositoryFactory } from '@aopslab/xf-dm'
import { IRepositoryPortPlanningLineage } from '../ports/repository-ports/index.js'
import { PlanningLineageDrizzleRepo, PlanningLineageDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { inferDrizzleDialectFromRepositoryConfig } from './drizzleDialect.js'

const planningLineagePgFactory = createRepositoryFactory<IRepositoryPortPlanningLineage>({
  moduleName: 'RepositoryFactoryPlanningLineage',
  mongoRepo: undefined,
  drizzleRepo: PlanningLineageDrizzleRepo,
})

const planningLineageSqliteFactory = createRepositoryFactory<IRepositoryPortPlanningLineage>({
  moduleName: 'RepositoryFactoryPlanningLineageSqlite',
  mongoRepo: undefined,
  drizzleRepo: PlanningLineageDrizzleSqliteRepo,
})

export const RepositoryFactoryPlanningLineage = {
  create(params: Parameters<typeof planningLineagePgFactory.create>[0]) {
    const dialect = inferDrizzleDialectFromRepositoryConfig(params.repositoryConfig)
    return (dialect === 'sqlite' ? planningLineageSqliteFactory : planningLineagePgFactory).create(params)
  },
}
