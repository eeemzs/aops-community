import { IRepositoryPortWorkflowStepRun } from '../ports/repository-ports/index.js'
import { WorkflowStepRunDrizzleRepo, WorkflowStepRunDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryWorkflowStepRun = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortWorkflowStepRun>({
  moduleName: 'RepositoryFactoryWorkflowStepRun',
  pgRepo: WorkflowStepRunDrizzleRepo,
  sqliteRepo: WorkflowStepRunDrizzleSqliteRepo,
})
