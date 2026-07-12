import { IRepositoryPortWorkflowInstance } from '../ports/repository-ports/index.js'
import { WorkflowInstanceDrizzleRepo, WorkflowInstanceDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryWorkflowInstance = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortWorkflowInstance>({
  moduleName: 'RepositoryFactoryWorkflowInstance',
  pgRepo: WorkflowInstanceDrizzleRepo,
  sqliteRepo: WorkflowInstanceDrizzleSqliteRepo,
})
