/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IWorkflowInstanceServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortWorkflowInstance } from '../ports/repository-ports/index.js'
import { WorkflowInstanceService, type WorkflowInstanceServiceOptions } from '../services/index.js'
import { WorkflowInstanceServiceError } from '../errors/WorkflowInstanceServiceError.js'
import { RepositoryFactoryWorkflowInstance } from './RepositoryFactoryWorkflowInstance.js'

export interface WorkflowInstanceServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface WorkflowInstanceServiceFactoryOverrides {
  workflowInstanceRepository?: IRepositoryPortWorkflowInstance
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderWorkflowInstance {
  private config?: WorkflowInstanceServiceFactoryConfig
  private overrides: WorkflowInstanceServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderWorkflowInstance {
    return new ServiceBuilderWorkflowInstance()
  }

  withConfig(config: WorkflowInstanceServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortWorkflowInstance): this {
    this.overrides.workflowInstanceRepository = repository
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

  withOverrides(overrides: WorkflowInstanceServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IWorkflowInstanceServicePort, WorkflowInstanceServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.workflowInstanceRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderWorkflowInstance::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderWorkflowInstance', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let workflowInstanceRepository: IRepositoryPortWorkflowInstance
      if (self.overrides.workflowInstanceRepository) {
        workflowInstanceRepository = self.overrides.workflowInstanceRepository as IRepositoryPortWorkflowInstance
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderWorkflowInstance::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        }

        workflowInstanceRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryWorkflowInstance.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryWorkflowInstance.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderWorkflowInstance::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: WorkflowInstanceServiceOptions = {
        workflowInstanceRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      }

      const service = new WorkflowInstanceService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IWorkflowInstanceServicePort
    })
  }
}
