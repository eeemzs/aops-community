/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IWorkflowStepRunServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortWorkflowStepRun } from '../ports/repository-ports/index.js'
import { WorkflowStepRunService, type WorkflowStepRunServiceOptions } from '../services/index.js'
import { WorkflowStepRunServiceError } from '../errors/WorkflowStepRunServiceError.js'
import { RepositoryFactoryWorkflowStepRun } from './RepositoryFactoryWorkflowStepRun.js'

export interface WorkflowStepRunServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface WorkflowStepRunServiceFactoryOverrides {
  workflowStepRunRepository?: IRepositoryPortWorkflowStepRun
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderWorkflowStepRun {
  private config?: WorkflowStepRunServiceFactoryConfig
  private overrides: WorkflowStepRunServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderWorkflowStepRun {
    return new ServiceBuilderWorkflowStepRun()
  }

  withConfig(config: WorkflowStepRunServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortWorkflowStepRun): this {
    this.overrides.workflowStepRunRepository = repository
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

  withOverrides(overrides: WorkflowStepRunServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IWorkflowStepRunServicePort, WorkflowStepRunServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.workflowStepRunRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderWorkflowStepRun::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderWorkflowStepRun', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let workflowStepRunRepository: IRepositoryPortWorkflowStepRun
      if (self.overrides.workflowStepRunRepository) {
        workflowStepRunRepository = self.overrides.workflowStepRunRepository as IRepositoryPortWorkflowStepRun
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderWorkflowStepRun::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        }

        workflowStepRunRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryWorkflowStepRun.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryWorkflowStepRun.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderWorkflowStepRun::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: WorkflowStepRunServiceOptions = {
        workflowStepRunRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      }

      const service = new WorkflowStepRunService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IWorkflowStepRunServicePort
    })
  }
}
