import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortKanbanTemplate } from '../ports/repository-ports/index.js'
import type { IKanbanTemplateServicePort, KanbanTemplateCreateInput, KanbanTemplateApplyResult } from '../ports/inbound/index.js'
import { KanbanTemplateServiceError } from '../errors/KanbanTemplateServiceError.js'
import { IbmKanbanTemplate, IbmKanbanTemplateInsert, kanbanTemplateZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema, validateUuidInput } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface KanbanTemplateServiceDependencies {}

export interface KanbanTemplateServiceOptions {
  kanbanTemplateRepository: IRepositoryPortKanbanTemplate
  serviceDependencies?: Partial<KanbanTemplateServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class KanbanTemplateService implements IKanbanTemplateServicePort {
  private readonly kanbanTemplateRepository: IRepositoryPortKanbanTemplate
  private readonly logger?: XfLogger

  constructor(options: KanbanTemplateServiceOptions) {
    this.kanbanTemplateRepository = options.kanbanTemplateRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmKanbanTemplate>): Effect.Effect<IbmKanbanTemplate | null, KanbanTemplateServiceError> {
    const stage = 'KanbanTemplateService::getById'
    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.kanbanTemplateRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmKanbanTemplateInsert): Effect.Effect<IbmKanbanTemplate, KanbanTemplateServiceError> {
    const stage = 'KanbanTemplateService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: kanbanTemplateZodSchemaInsert,
          stage,
          operation: 'KanbanTemplateService::create.kanbanTemplateZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.kanbanTemplateRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  createTemplate(input: KanbanTemplateCreateInput): Effect.Effect<IbmKanbanTemplate, KanbanTemplateServiceError> {
    const stage = 'KanbanTemplateService::createTemplate'
    return pipe(
      validateInput(input, 'input', { stage }),
      Effect.flatMap((payload) => this.create(payload as IbmKanbanTemplateInsert)),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in createTemplate')
      }))
    )
  }

  updateTemplate(id: string, patch: Partial<IbmKanbanTemplate>): Effect.Effect<IbmKanbanTemplate, KanbanTemplateServiceError> {
    const stage = 'KanbanTemplateService::updateTemplate'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: kanbanTemplateZodSchemaInsert.partial().strict(),
          stage,
          operation: 'KanbanTemplateService::updateTemplate.kanbanTemplateZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((templateId) => this.kanbanTemplateRepository.patchById(templateId, patch).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateTemplate')
      }))
    )
  }

  listTemplates(
    filter: Partial<IbmKanbanTemplate> = {},
    options?: DbQueryOptions<IbmKanbanTemplate>
  ): Effect.Effect<IbmKanbanTemplate[], KanbanTemplateServiceError> {
    const stage = 'KanbanTemplateService::listTemplates'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) =>
        this.kanbanTemplateRepository.find({ matchEq: filter, options } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listTemplates')
      }))
    )
  }

  removeTemplate(id: string): Effect.Effect<void, KanbanTemplateServiceError> {
    const stage = 'KanbanTemplateService::removeTemplate'
    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((templateId) =>
        this.kanbanTemplateRepository.deleteById(templateId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in removeTemplate')
      }))
    )
  }

  applyTemplateToProject(templateId: string, projectId: string): Effect.Effect<KanbanTemplateApplyResult, KanbanTemplateServiceError> {
    const stage = 'KanbanTemplateService::applyTemplateToProject'
    void templateId
    void projectId
    return Effect.fail(
      XfErrorFactory.configurationError({
        stage,
        message: 'kanban_template_apply_requires_column_scope_migration',
      }),
    )
  }
}
