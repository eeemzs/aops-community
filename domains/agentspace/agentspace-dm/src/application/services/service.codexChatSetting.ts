import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortCodexChatSetting } from '../ports/repository-ports/index.js'
import type { ICodexChatSettingServicePort } from '../ports/inbound/index.js'
import { CodexChatSettingServiceError } from '../errors/CodexChatSettingServiceError.js'
import { IbmCodexChatSetting, IbmCodexChatSettingInsert, codexChatSettingZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface CodexChatSettingServiceDependencies {}

export interface CodexChatSettingServiceOptions {
  codexChatSettingRepository: IRepositoryPortCodexChatSetting
  serviceDependencies?: Partial<CodexChatSettingServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class CodexChatSettingService implements ICodexChatSettingServicePort {
  private readonly codexChatSettingRepository: IRepositoryPortCodexChatSetting
  private readonly logger?: XfLogger

  constructor(options: CodexChatSettingServiceOptions) {
    this.codexChatSettingRepository = options.codexChatSettingRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(
    id: string,
    options?: DbQueryOptions<IbmCodexChatSetting>
  ): Effect.Effect<IbmCodexChatSetting | null, CodexChatSettingServiceError> {
    const stage = 'CodexChatSettingService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((value) =>
        this.codexChatSettingRepository.findById(value, options).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
        })
      )
    )
  }

  create(data: IbmCodexChatSettingInsert): Effect.Effect<IbmCodexChatSetting, CodexChatSettingServiceError> {
    const stage = 'CodexChatSettingService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: codexChatSettingZodSchemaInsert,
          stage,
          operation: 'CodexChatSettingService::create.codexChatSettingZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((value) =>
        this.codexChatSettingRepository.create(value).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
        )
      )
    )
  }

  addSetting(data: IbmCodexChatSettingInsert): Effect.Effect<IbmCodexChatSetting, CodexChatSettingServiceError> {
    const stage = 'CodexChatSettingService::addSetting'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: codexChatSettingZodSchemaInsert,
          stage,
          operation: 'CodexChatSettingService::addSetting.codexChatSettingZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((payload) => this.create(payload)),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in addSetting')
        })
      )
    )
  }

  updateSetting(
    id: string,
    patch: Partial<IbmCodexChatSetting>
  ): Effect.Effect<IbmCodexChatSetting, CodexChatSettingServiceError> {
    const stage = 'CodexChatSettingService::updateSetting'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: codexChatSettingZodSchemaInsert.partial().strict(),
          stage,
          operation: 'CodexChatSettingService::updateSetting.codexChatSettingZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((settingId) =>
        this.codexChatSettingRepository.patchById(settingId, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateSetting')
        })
      )
    )
  }

  listSettings(
    filter: Partial<IbmCodexChatSetting> = {},
    options?: DbQueryOptions<IbmCodexChatSetting>
  ): Effect.Effect<IbmCodexChatSetting[], CodexChatSettingServiceError> {
    const stage = 'CodexChatSettingService::listSettings'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((value) =>
        this.codexChatSettingRepository.find({ matchEq: value, options } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in listSettings')
        })
      )
    )
  }

  removeSetting(id: string): Effect.Effect<void, CodexChatSettingServiceError> {
    const stage = 'CodexChatSettingService::removeSetting'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((settingId) =>
        this.codexChatSettingRepository.deleteById(settingId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined)
    )
  }
}

