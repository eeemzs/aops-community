/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IKanbanTemplateServicePort } from '../ports/inbound/index.js'
import type {
  IRepositoryPortKanbanTemplate,
} from '../ports/repository-ports/index.js'
import { KanbanTemplateService, type KanbanTemplateServiceOptions } from '../services/index.js'
import { KanbanTemplateServiceError } from '../errors/KanbanTemplateServiceError.js'
import {
  RepositoryFactoryKanbanTemplate,
} from './index.js'

export interface KanbanTemplateServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface KanbanTemplateServiceFactoryOverrides {
  kanbanTemplateRepository?: IRepositoryPortKanbanTemplate
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderKanbanTemplate {
  private config?: KanbanTemplateServiceFactoryConfig
  private overrides: KanbanTemplateServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderKanbanTemplate {
    return new ServiceBuilderKanbanTemplate()
  }

  withConfig(config: KanbanTemplateServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortKanbanTemplate): this {
    this.overrides.kanbanTemplateRepository = repository
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

  withOverrides(overrides: KanbanTemplateServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IKanbanTemplateServicePort, KanbanTemplateServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.kanbanTemplateRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderKanbanTemplate::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderKanbanTemplate', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      const repositoryConfig = config.repositoryConfig
      const repositoryParams: RepositoryCreateParams | null = repositoryConfig
        ? { repositoryConfig, redisConfig: config.redisConfig, logger }
        : null

      const kanbanTemplateRepository: IRepositoryPortKanbanTemplate =
        self.overrides.kanbanTemplateRepository ??
        (repositoryParams
          ? yield* _(
              Effect.mapError(
                RepositoryFactoryKanbanTemplate.create(repositoryParams),
                (error) =>
                  new XfConfigurationError({
                    message: `RepositoryFactoryKanbanTemplate.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                    stage: 'ServiceBuilderKanbanTemplate::build',
                    cause: error,
                  }),
              ),
            )
          : yield* _(
              Effect.fail(
                new XfConfigurationError({
                  message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                  stage: 'ServiceBuilderKanbanTemplate::build',
                }),
              ),
            ))

      const serviceOptions: KanbanTemplateServiceOptions = {
        kanbanTemplateRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new KanbanTemplateService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IKanbanTemplateServicePort
    })
  }
}
