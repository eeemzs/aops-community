/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IKanbanColumnServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortKanbanColumn } from '../ports/repository-ports/index.js'
import { KanbanColumnService, type KanbanColumnServiceOptions } from '../services/index.js'
import { KanbanColumnServiceError } from '../errors/KanbanColumnServiceError.js'
import { RepositoryFactoryKanbanColumn } from './RepositoryFactoryKanbanColumn.js'

export interface KanbanColumnServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface KanbanColumnServiceFactoryOverrides {
  kanbanColumnRepository?: IRepositoryPortKanbanColumn
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderKanbanColumn {
  private config?: KanbanColumnServiceFactoryConfig
  private overrides: KanbanColumnServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderKanbanColumn {
    return new ServiceBuilderKanbanColumn()
  }

  withConfig(config: KanbanColumnServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortKanbanColumn): this {
    this.overrides.kanbanColumnRepository = repository
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

  withOverrides(overrides: KanbanColumnServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IKanbanColumnServicePort, KanbanColumnServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.kanbanColumnRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderKanbanColumn::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderKanbanColumn', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let kanbanColumnRepository: IRepositoryPortKanbanColumn;
      if (self.overrides.kanbanColumnRepository) {
        kanbanColumnRepository = self.overrides.kanbanColumnRepository as IRepositoryPortKanbanColumn
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderKanbanColumn::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        kanbanColumnRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryKanbanColumn.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryKanbanColumn.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderKanbanColumn::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: KanbanColumnServiceOptions = {
        kanbanColumnRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new KanbanColumnService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IKanbanColumnServicePort
    })
  }
}
