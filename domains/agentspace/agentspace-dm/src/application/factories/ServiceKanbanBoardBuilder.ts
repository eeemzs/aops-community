/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IKanbanBoardServicePort, IKanbanColumnServicePort, ITaskServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortKanbanBoard } from '../ports/repository-ports/index.js'
import { KanbanBoardService, type KanbanBoardServiceOptions } from '../services/index.js'
import { KanbanBoardServiceError } from '../errors/KanbanBoardServiceError.js'
import { RepositoryFactoryKanbanBoard } from './RepositoryFactoryKanbanBoard.js'

export interface KanbanBoardServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface KanbanBoardServiceFactoryOverrides {
  kanbanBoardRepository?: IRepositoryPortKanbanBoard
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export interface KanbanBoardServiceFactoryDependencies {
  kanbanColumnService?: IKanbanColumnServicePort
  taskService?: ITaskServicePort
}

export class ServiceBuilderKanbanBoard {
  private serviceDependencies: Partial<KanbanBoardServiceFactoryDependencies> = {}
  private config?: KanbanBoardServiceFactoryConfig
  private overrides: KanbanBoardServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderKanbanBoard {
    return new ServiceBuilderKanbanBoard()
  }

  withConfig(config: KanbanBoardServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortKanbanBoard): this {
    this.overrides.kanbanBoardRepository = repository
    return this
  }

  withServiceDependencies(dependencies: Partial<KanbanBoardServiceFactoryDependencies>): this {
    this.serviceDependencies = { ...this.serviceDependencies, ...dependencies }
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

  withOverrides(overrides: KanbanBoardServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IKanbanBoardServicePort, KanbanBoardServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.kanbanBoardRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderKanbanBoard::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderKanbanBoard', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let kanbanBoardRepository: IRepositoryPortKanbanBoard;
      if (self.overrides.kanbanBoardRepository) {
        kanbanBoardRepository = self.overrides.kanbanBoardRepository as IRepositoryPortKanbanBoard
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderKanbanBoard::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        kanbanBoardRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryKanbanBoard.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryKanbanBoard.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderKanbanBoard::build',
                cause: error,
              }),
          ),
        )
      }

      if (!self.serviceDependencies.kanbanColumnService || !self.serviceDependencies.taskService) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'KanbanColumnService ve TaskService dependency olarak saglanmali.',
              stage: 'ServiceBuilderKanbanBoard::build',
            })
          )
        )
      }

      const serviceOptions: KanbanBoardServiceOptions = {
        kanbanBoardRepository,
        kanbanColumnService: self.serviceDependencies.kanbanColumnService as IKanbanColumnServicePort,
        taskService: self.serviceDependencies.taskService as ITaskServicePort,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new KanbanBoardService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IKanbanBoardServicePort
    })
  }
}
