/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { IUnitOfWork, RepositoryConfig } from '@aopslab/xf-db'
import type { IChatServicePort } from '../ports/inbound/index.js'
import type {
  IRepositoryPortChatMessage,
  IRepositoryPortChatRoom,
  IRepositoryPortChatRoomBinding,
  IRepositoryPortChatRoomMember,
  IRepositoryPortScope,
} from '../ports/repository-ports/index.js'
import { ChatService, type ChatServiceOptions } from '../services/index.js'
import { ChatServiceError } from '../errors/ChatServiceError.js'
import { RepositoryFactoryChatMessage } from './RepositoryFactoryChatMessage.js'
import { RepositoryFactoryChatRoom } from './RepositoryFactoryChatRoom.js'
import { RepositoryFactoryChatRoomBinding } from './RepositoryFactoryChatRoomBinding.js'
import { RepositoryFactoryChatRoomMember } from './RepositoryFactoryChatRoomMember.js'
import { createAgentspaceDrizzleUnitOfWork } from './drizzleDialect.js'

export interface ChatServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
}

export interface ChatServiceFactoryOverrides {
  chatRoomRepository?: IRepositoryPortChatRoom
  chatRoomMemberRepository?: IRepositoryPortChatRoomMember
  chatRoomBindingRepository?: IRepositoryPortChatRoomBinding
  chatMessageRepository?: IRepositoryPortChatMessage
  scopeRepository?: IRepositoryPortScope
}

export class ServiceBuilderChat {
  private config?: ChatServiceFactoryConfig
  private overrides: ChatServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderChat {
    return new ServiceBuilderChat()
  }

  withConfig(config: ChatServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepositories(overrides: ChatServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
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

  withOverrides(overrides: ChatServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IChatServicePort, ChatServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      const hasAllRepositoryOverrides = Boolean(
        self.overrides.chatRoomRepository &&
          self.overrides.chatRoomMemberRepository &&
          self.overrides.chatRoomBindingRepository &&
          self.overrides.chatMessageRepository
      )

      if (!self.config && !hasAllRepositoryOverrides) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository overrides or repositoryConfig are required',
              operation: 'build',
              stage: 'ServiceBuilderChat::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderChat', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      if (!hasAllRepositoryOverrides && !config.repositoryConfig) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'Repository config is required when chat repositories are not all overridden.',
              stage: 'ServiceBuilderChat::build',
            })
          )
        )
      }

      const repositoryParams: RepositoryCreateParams | undefined = config.repositoryConfig
        ? {
            repositoryConfig: config.repositoryConfig,
            redisConfig: config.redisConfig,
            logger,
          }
        : undefined

      const chatRoomRepository =
        self.overrides.chatRoomRepository ??
        (yield* _(
          Effect.mapError(
            RepositoryFactoryChatRoom.create(repositoryParams!),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryChatRoom.create failed: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderChat::build',
                cause: error,
              }),
          ),
        ))

      const chatRoomMemberRepository =
        self.overrides.chatRoomMemberRepository ??
        (yield* _(
          Effect.mapError(
            RepositoryFactoryChatRoomMember.create(repositoryParams!),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryChatRoomMember.create failed: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderChat::build',
                cause: error,
              }),
          ),
        ))

      const chatRoomBindingRepository =
        self.overrides.chatRoomBindingRepository ??
        (yield* _(
          Effect.mapError(
            RepositoryFactoryChatRoomBinding.create(repositoryParams!),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryChatRoomBinding.create failed: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderChat::build',
                cause: error,
              }),
          ),
        ))

      const chatMessageRepository =
        self.overrides.chatMessageRepository ??
        (yield* _(
          Effect.mapError(
            RepositoryFactoryChatMessage.create(repositoryParams!),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryChatMessage.create failed: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderChat::build',
                cause: error,
              }),
          ),
        ))

      let unitOfWork: IUnitOfWork | undefined
      if (config.repositoryConfig) {
        unitOfWork = createAgentspaceDrizzleUnitOfWork(config.repositoryConfig)
      }

      const serviceOptions: ChatServiceOptions = {
        chatRoomRepository,
        chatRoomMemberRepository,
        chatRoomBindingRepository,
        chatMessageRepository,
        scopeRepository: self.overrides.scopeRepository,
        unitOfWork,
        logger,
      }

      const service = new ChatService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IChatServicePort
    })
  }
}
