import { randomUUID } from 'node:crypto'
import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortPlanningLineage } from '../ports/repository-ports/index.js'
import type { IPlanningLineageServicePort, PlanningLineageRecordCopyInput } from '../ports/inbound/index.js'
import { PlanningLineageServiceError } from '../errors/PlanningLineageServiceError.js'
import { IbmPlanningLineage, IbmPlanningLineageInsert, planningLineageZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema, validateUuidInput } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface PlanningLineageServiceDependencies {}

export interface PlanningLineageServiceOptions {
  planningLineageRepository: IRepositoryPortPlanningLineage
  serviceDependencies?: Partial<PlanningLineageServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class PlanningLineageService implements IPlanningLineageServicePort {
  private readonly planningLineageRepository: IRepositoryPortPlanningLineage
  private readonly logger?: XfLogger

  constructor(options: PlanningLineageServiceOptions) {
    this.planningLineageRepository = options.planningLineageRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmPlanningLineage>): Effect.Effect<IbmPlanningLineage | null, PlanningLineageServiceError> {
    const stage = 'PlanningLineageService::getById'
    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.planningLineageRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmPlanningLineageInsert): Effect.Effect<IbmPlanningLineage, PlanningLineageServiceError> {
    const stage = 'PlanningLineageService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: planningLineageZodSchemaInsert,
          stage,
          operation: 'PlanningLineageService::create.planningLineageZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => {
        const now = new Date()
        const record = {
          ...data,
          id: randomUUID(),
          createdAt: now,
          updatedAt: now,
        }
        return this.planningLineageRepository.create(record as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
        )
      })
    )
  }

  listLineages(
    filter: Partial<IbmPlanningLineage> = {},
    options?: DbQueryOptions<IbmPlanningLineage>
  ): Effect.Effect<IbmPlanningLineage[], PlanningLineageServiceError> {
    const stage = 'PlanningLineageService::listLineages'
    const queryOptions = options?.sort
      ? options
      : { ...options, sort: [{ field: 'createdAt', type: 'desc' }] }
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) =>
        this.planningLineageRepository.find({ matchEq: filter, options: queryOptions } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listLineages')
      }))
    )
  }

  recordCopyLineage(input: PlanningLineageRecordCopyInput): Effect.Effect<IbmPlanningLineage, PlanningLineageServiceError> {
    const stage = 'PlanningLineageService::recordCopyLineage'
    return pipe(
      validateInput(input, 'input', { stage }),
      Effect.flatMap((payload) =>
        this.create({
          scopeId: payload.scopeId,
          projectId: payload.projectId,
          operation: 'copy',
          sourceType: payload.sourceType,
          sourceId: payload.sourceId,
          targetType: payload.targetType,
          targetId: payload.targetId,
          copyDepth: payload.copyDepth,
          sourceProjectId: payload.sourceProjectId ?? undefined,
          targetProjectId: payload.targetProjectId ?? undefined,
          details: payload.details,
          createdBy: payload.createdBy,
        } as IbmPlanningLineageInsert)
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in recordCopyLineage')
      }))
    )
  }
}
