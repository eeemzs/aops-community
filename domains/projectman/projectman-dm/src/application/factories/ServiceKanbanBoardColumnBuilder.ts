/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IKanbanBoardColumnServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortKanbanBoardColumn } from '../ports/repository-ports/index.js'
import { KanbanBoardColumnService, type KanbanBoardColumnServiceOptions } from '../services/index.js'
import { KanbanBoardColumnServiceError } from '../errors/KanbanBoardColumnServiceError.js'
import { RepositoryFactoryKanbanBoardColumn } from './RepositoryFactoryKanbanBoardColumn.js'

export interface KanbanBoardColumnServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface KanbanBoardColumnServiceFactoryOverrides {
  kanbanBoardColumnRepository?: IRepositoryPortKanbanBoardColumn
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderKanbanBoardColumn {
  private config?: KanbanBoardColumnServiceFactoryConfig
  private overrides: KanbanBoardColumnServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderKanbanBoardColumn {
    return new ServiceBuilderKanbanBoardColumn()
  }

  withConfig(config: KanbanBoardColumnServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortKanbanBoardColumn): this {
    this.overrides.kanbanBoardColumnRepository = repository
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

  withOverrides(overrides: KanbanBoardColumnServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IKanbanBoardColumnServicePort, KanbanBoardColumnServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.kanbanBoardColumnRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderKanbanBoardColumn::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderKanbanBoardColumn', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let kanbanBoardColumnRepository: IRepositoryPortKanbanBoardColumn;
      if (self.overrides.kanbanBoardColumnRepository) {
        kanbanBoardColumnRepository = self.overrides.kanbanBoardColumnRepository as IRepositoryPortKanbanBoardColumn
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderKanbanBoardColumn::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        kanbanBoardColumnRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryKanbanBoardColumn.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryKanbanBoardColumn.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderKanbanBoardColumn::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: KanbanBoardColumnServiceOptions = {
        kanbanBoardColumnRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new KanbanBoardColumnService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IKanbanBoardColumnServicePort
    })
  }
}
