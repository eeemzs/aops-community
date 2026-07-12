/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'

import type { IWorkflowDefinitionServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortWorkflowDefinition } from '../ports/repository-ports/index.js'
import { WorkflowDefinitionService, type WorkflowDefinitionServiceOptions } from '../services/index.js'
import { WorkflowDefinitionServiceError } from '../errors/WorkflowDefinitionServiceError.js'
import { RepositoryFactoryWorkflowDefinition } from './RepositoryFactoryWorkflowDefinition.js'

export interface WorkflowDefinitionServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
}

export interface WorkflowDefinitionServiceFactoryOverrides {
  workflowDefinitionRepository?: IRepositoryPortWorkflowDefinition
}

export class ServiceBuilderWorkflowDefinition {
  private config?: WorkflowDefinitionServiceFactoryConfig
  private overrides: WorkflowDefinitionServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderWorkflowDefinition {
    return new ServiceBuilderWorkflowDefinition()
  }

  withConfig(config: WorkflowDefinitionServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortWorkflowDefinition): this {
    this.overrides.workflowDefinitionRepository = repository
    return this
  }

  withLogger(logger?: XfLogger): this {
    if (this.config) {
      this.config.logger = logger
    }
    return this
  }

  withLogLevel(logLevel?: string): this {
    this.logLevel = logLevel
    return this
  }

  withOverrides(overrides: WorkflowDefinitionServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IWorkflowDefinitionServicePort, WorkflowDefinitionServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.workflowDefinitionRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderWorkflowDefinition::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'
      const logger = config.logger?.child(
        { module: 'ServiceBuilderWorkflowDefinition', parent: getParent(config.logger) },
        { level: effectiveLogLevel }
      )

      let workflowDefinitionRepository: IRepositoryPortWorkflowDefinition
      if (self.overrides.workflowDefinitionRepository) {
        workflowDefinitionRepository = self.overrides.workflowDefinitionRepository
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderWorkflowDefinition::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        }

        workflowDefinitionRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryWorkflowDefinition.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryWorkflowDefinition.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderWorkflowDefinition::build',
                cause: error,
              })
          )
        )
      }

      const serviceOptions: WorkflowDefinitionServiceOptions = {
        workflowDefinitionRepository,
        logger,
      }

      const service = new WorkflowDefinitionService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IWorkflowDefinitionServicePort
    })
  }
}
