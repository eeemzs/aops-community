import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import {
  DbQueryOptions,
  IRepositoryBase,
  IRepositoryContext,
  IUnitOfWork,
  mapDbError,
  runInTransactionEffect,
} from '@aopslab/xf-db'
import type {
  IRepositoryPortDiscussionOutput,
  IRepositoryPortDiscussionTopic,
  IRepositoryPortDiscussionTurn,
  IRepositoryPortScope,
} from '../ports/repository-ports/index.js'
import type {
  DiscussionOpenQuestion,
  DiscussionOutputSetInput,
  DiscussionStatus,
  DiscussionTopicCreateInput,
  DiscussionTopicDetail,
  DiscussionTopicListFilter,
  DiscussionTurnAddInput,
  IDiscussionServicePort,
} from '../ports/inbound/index.js'
import { DiscussionServiceError } from '../errors/DiscussionServiceError.js'
import {
  IbmDiscussionOutput,
  IbmDiscussionOutputInsert,
  IbmDiscussionTopic,
  IbmDiscussionTopicInsert,
  IbmDiscussionTurn,
  IbmDiscussionTurnInsert,
  discussionOutputZodSchemaInsert,
  discussionTopicZodSchemaInsert,
  discussionTurnZodSchemaInsert,
} from '../../domain/models/index.js'
import type { DiscussionBlockedOn, DiscussionTopicStatus } from '../../domain/types.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { listRecordsByScopeResolution } from './service.scope-resolution.js'

const OUTPUT_TBD_MARKER = '_TBD_'

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function sortTurnsBySeq(turns: readonly IbmDiscussionTurn[]): IbmDiscussionTurn[] {
  return [...turns].sort((a, b) => Number(a.seq ?? 0) - Number(b.seq ?? 0))
}

function computeNextSpeaker(
  turnOrder: readonly string[] | undefined,
  lastAgentId: string | undefined
): string | null {
  const order = (turnOrder ?? []).map((id) => normalizeNonEmpty(id)).filter((id): id is string => Boolean(id))
  if (order.length === 0) return null
  const normalizedLast = normalizeNonEmpty(lastAgentId)
  if (!normalizedLast) return order[0]
  const lastIndex = order.indexOf(normalizedLast)
  if (lastIndex < 0) return order[0]
  return order[(lastIndex + 1) % order.length]
}

function computeOpenQuestions(turns: readonly IbmDiscussionTurn[]): DiscussionOpenQuestion[] {
  const ordered = sortTurnsBySeq(turns)
  const open: DiscussionOpenQuestion[] = []
  for (const turn of ordered) {
    if (turn.kind !== 'question') continue
    const turnSeq = Number(turn.seq ?? 0)
    // A question is closed ONLY by an answer that explicitly replies to it
    // (replyToSeq === question seq), not merely by a later answer to some other
    // question (codex S1.2.1 RRR: reply correlation).
    const answered = ordered.some(
      (other) => other.kind === 'answer' && Number(other.replyToSeq ?? Number.NaN) === turnSeq
    )
    if (!answered) {
      open.push({ seq: turnSeq, agentId: turn.agentId, text: turn.text })
    }
  }
  return open
}

function participantsWithFinalStance(turns: readonly IbmDiscussionTurn[]): Set<string> {
  const stanced = new Set<string>()
  for (const turn of turns) {
    if (turn.kind === 'final-stance') {
      const agentId = normalizeNonEmpty(turn.agentId)
      if (agentId) stanced.add(agentId)
    }
  }
  return stanced
}

function evaluateConcludeReadiness(
  topic: IbmDiscussionTopic,
  turns: readonly IbmDiscussionTurn[]
): { canConclude: boolean; reason: string } {
  const minTurns = topic.rules?.minTurnsBeforeConclude
  if (typeof minTurns === 'number' && turns.length < minTurns) {
    return {
      canConclude: false,
      reason: `min_turns_not_met:${turns.length}/${minTurns}`,
    }
  }

  const participants = (topic.participants ?? [])
    .map((id) => normalizeNonEmpty(id))
    .filter((id): id is string => Boolean(id))
  const stanced = participantsWithFinalStance(turns)
  const missing = participants.filter((agentId) => !stanced.has(agentId))
  if (missing.length > 0) {
    return {
      canConclude: false,
      reason: `missing_final_stance:${missing.join(',')}`,
    }
  }

  return { canConclude: true, reason: 'ready_to_conclude' }
}

type DiscussionWriteDeps = {
  discussionTopicRepository: IRepositoryPortDiscussionTopic
  discussionTurnRepository: IRepositoryPortDiscussionTurn
  discussionOutputRepository: IRepositoryPortDiscussionOutput
}

function discussionEffect<T>(effect: Effect.Effect<T, unknown, unknown>): Effect.Effect<T, DiscussionServiceError> {
  return effect as unknown as Effect.Effect<T, DiscussionServiceError>
}

function topicNotActiveError(topicId: string, status: string): Error {
  return new Error(`agentspace.conflict:discussion_topic_not_active:${topicId}:${status}`)
}

function blockedOnOperatorError(topicId: string): Error {
  return new Error(`agentspace.conflict:discussion_blocked_on_operator:${topicId}`)
}

function turnOrderViolationError(topicId: string, expected: string, actual: string): Error {
  return new Error(`agentspace.conflict:discussion_turn_order:${topicId}:expected=${expected}:actual=${actual}`)
}

function expectedSeqConflictError(topicId: string, expected: number, actual: number): Error {
  return new Error(`agentspace.conflict:discussion_expected_seq:${topicId}:expected=${expected}:actual=${actual}`)
}

function concludeBlockedError(topicId: string, reason: string): Error {
  return new Error(`agentspace.conflict:discussion_conclude_blocked:${topicId}:${reason}`)
}

function abandonBlockedError(topicId: string, status: string): Error {
  return new Error(`agentspace.conflict:discussion_abandon_blocked:${topicId}:${status}`)
}

function outputTbdError(topicId: string, outputKind: string): Error {
  return new Error(`agentspace.conflict:discussion_output_tbd:${topicId}:${outputKind}`)
}

function outputOwnerNotParticipantError(topicId: string, ownerAgentId: string): Error {
  return new Error(`agentspace.conflict:discussion_output_owner_not_participant:${topicId}:${ownerAgentId}`)
}

export interface DiscussionServiceDependencies {}

export interface DiscussionServiceOptions extends DiscussionWriteDeps {
  scopeRepository?: IRepositoryPortScope
  unitOfWork?: IUnitOfWork
  serviceDependencies?: Partial<DiscussionServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class DiscussionService implements IDiscussionServicePort {
  private readonly discussionTopicRepository: IRepositoryPortDiscussionTopic
  private readonly discussionTurnRepository: IRepositoryPortDiscussionTurn
  private readonly discussionOutputRepository: IRepositoryPortDiscussionOutput
  private readonly scopeRepository?: IRepositoryPortScope
  private readonly unitOfWork?: IUnitOfWork
  private readonly logger?: XfLogger

  constructor(options: DiscussionServiceOptions) {
    this.discussionTopicRepository = options.discussionTopicRepository
    this.discussionTurnRepository = options.discussionTurnRepository
    this.discussionOutputRepository = options.discussionOutputRepository
    this.scopeRepository = options.scopeRepository
    this.unitOfWork = options.unitOfWork
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  private bindRepositoryContext(repository: unknown, ctx: IRepositoryContext | undefined): repository is IRepositoryBase {
    if (!ctx || !repository || typeof repository !== 'object') return false
    return (
      typeof (repository as IRepositoryBase).setCtx === 'function' &&
      typeof (repository as IRepositoryBase).clearCtx === 'function'
    )
  }

  private withRepositoryContext<R>(
    ctx: IRepositoryContext | undefined,
    program: () => Effect.Effect<R, DiscussionServiceError>
  ): Effect.Effect<R, DiscussionServiceError> {
    const scoped: IRepositoryBase[] = []
    if (this.bindRepositoryContext(this.discussionTopicRepository, ctx)) scoped.push(this.discussionTopicRepository)
    if (this.bindRepositoryContext(this.discussionTurnRepository, ctx)) scoped.push(this.discussionTurnRepository)
    if (this.bindRepositoryContext(this.discussionOutputRepository, ctx)) scoped.push(this.discussionOutputRepository)

    return Effect.acquireUseRelease(
      Effect.sync(() => {
        for (const repository of scoped) repository.setCtx(ctx!)
      }),
      () => program(),
      () =>
        Effect.sync(() => {
          for (const repository of scoped) repository.clearCtx()
        })
    )
  }

  private runWriteEffect<R>(
    program: (deps: DiscussionWriteDeps) => Effect.Effect<R, DiscussionServiceError>
  ): Effect.Effect<R, DiscussionServiceError> {
    const deps: DiscussionWriteDeps = {
      discussionTopicRepository: this.discussionTopicRepository,
      discussionTurnRepository: this.discussionTurnRepository,
      discussionOutputRepository: this.discussionOutputRepository,
    }

    if (!this.unitOfWork) {
      return program(deps)
    }

    return runInTransactionEffect(this.unitOfWork, (ctx) =>
      this.withRepositoryContext(ctx, () => program(deps))
    )
  }

  private resolveTopicCreateInput(data: DiscussionTopicCreateInput): IbmDiscussionTopicInsert {
    return {
      ...data,
      status: data.status ?? 'active',
      lastSeq: Number.isInteger(data.lastSeq) ? Number(data.lastSeq) : 0,
    } as IbmDiscussionTopicInsert
  }

  private requireTopic(
    repository: IRepositoryPortDiscussionTopic,
    topicId: string,
    stage: string
  ): Effect.Effect<IbmDiscussionTopic, DiscussionServiceError> {
    return repository.findById(topicId).pipe(
      Effect.mapError(mapDbError({ stage, operation: 'discussionTopicRepository.findById', factory: XfErrorFactory.notFound })),
      Effect.flatMap((topic) =>
        topic
          ? Effect.succeed(topic)
          : Effect.fail(XfErrorFactory.notFound({ stage, identifier: topicId }))
      )
    )
  }

  private listTurnsForTopic(
    repository: IRepositoryPortDiscussionTurn,
    topicId: string,
    stage: string
  ): Effect.Effect<IbmDiscussionTurn[], DiscussionServiceError> {
    return repository
      .find({ matchEq: { topicId }, options: { sort: [{ field: 'seq', type: 'asc' }] } } as any)
      .pipe(
        Effect.mapError(mapDbError({ stage, operation: 'discussionTurnRepository.find', factory: XfErrorFactory.notFound })),
        Effect.map((turns) => sortTurnsBySeq(turns))
      )
  }

  private findTurnByIdempotency(
    repository: IRepositoryPortDiscussionTurn,
    topicId: string,
    idempotencyKey: string,
    stage: string
  ): Effect.Effect<IbmDiscussionTurn | null, DiscussionServiceError> {
    return repository.find({ matchEq: { topicId, idempotencyKey }, options: { limit: 1 } } as any).pipe(
      Effect.map((rows) => rows[0] ?? null),
      Effect.mapError(mapDbError({ stage, operation: 'discussionTurnRepository.find', factory: XfErrorFactory.notFound }))
    )
  }

  createTopic(data: DiscussionTopicCreateInput): Effect.Effect<IbmDiscussionTopic, DiscussionServiceError> {
    const stage = 'DiscussionService::createTopic'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((input) =>
        this.runWriteEffect(({ discussionTopicRepository }) => {
          const topicPayload = this.resolveTopicCreateInput(input)
          return validateBmInputWithSchema({
            input: topicPayload,
            schema: discussionTopicZodSchemaInsert,
            stage,
            operation: 'DiscussionService::createTopic.discussionTopicZodSchemaInsert',
            field: 'data',
          }).pipe(
            Effect.flatMap((validated) =>
              discussionTopicRepository.create(validated).pipe(
                Effect.mapError(mapDbError({ stage, operation: 'discussionTopicRepository.create', factory: XfErrorFactory.createFailed }))
              )
            )
          )
        })
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in createTopic')
        })
      )
    )
  }

  getTopic(id: string): Effect.Effect<DiscussionTopicDetail, DiscussionServiceError> {
    const stage = 'DiscussionService::getTopic'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((topicId) =>
        this.requireTopic(this.discussionTopicRepository, topicId, stage).pipe(
          Effect.flatMap((topic) =>
            Effect.all({
              turns: this.listTurnsForTopic(this.discussionTurnRepository, topic.id as string, stage),
              outputs: this.discussionOutputRepository
                .find({ matchEq: { topicId: topic.id }, options: { sort: [{ field: 'outputKind', type: 'asc' }] } } as any)
                .pipe(
                  Effect.mapError(mapDbError({ stage, operation: 'discussionOutputRepository.find', factory: XfErrorFactory.notFound }))
                ),
            }).pipe(Effect.map(({ turns, outputs }) => ({ topic, turns, outputs })))
          )
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in getTopic')
        })
      )
    )
  }

  listTopics(
    filter: DiscussionTopicListFilter = {},
    options?: DbQueryOptions<IbmDiscussionTopic>
  ): Effect.Effect<IbmDiscussionTopic[], DiscussionServiceError> {
    const stage = 'DiscussionService::listTopics'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((value) =>
        listRecordsByScopeResolution(this.discussionTopicRepository as any, this.scopeRepository, value, options, {
          stage,
          defaultResolution: 'explicit',
        }).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'discussionTopicRepository.find', factory: XfErrorFactory.notFound }))
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in listTopics')
        })
      )
    )
  }

  addTurn(data: DiscussionTurnAddInput): Effect.Effect<IbmDiscussionTurn, DiscussionServiceError> {
    const stage = 'DiscussionService::addTurn'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((input): Effect.Effect<IbmDiscussionTurn, DiscussionServiceError> => {
        const idempotencyKey = normalizeNonEmpty(input.idempotencyKey)
        const { expectedSeq, ...turnInput } = input
        return this.runWriteEffect<IbmDiscussionTurn>(({ discussionTopicRepository, discussionTurnRepository }) => {
          const existingEffect = idempotencyKey
            ? this.findTurnByIdempotency(discussionTurnRepository, turnInput.topicId, idempotencyKey, stage)
            : Effect.succeed(null)

          return existingEffect.pipe(
            Effect.flatMap((existing) => {
              if (existing) return Effect.succeed(existing)

              return Effect.all({
                topic: this.requireTopic(discussionTopicRepository, turnInput.topicId, stage),
                turns: this.listTurnsForTopic(discussionTurnRepository, turnInput.topicId, stage),
              }).pipe(
                Effect.flatMap(({ topic, turns }) => {
                  // Guard (a): topic must be active.
                  if (topic.status !== 'active') {
                    return discussionEffect(Effect.fail(topicNotActiveError(turnInput.topicId, String(topic.status))))
                  }

                  // An operator-block clears ONLY via an answer that explicitly replies to the
                  // blocking question (replyToSeq === blockingTurnSeq) — not any addressedTo-less
                  // answer (codex S1.2.1 RRR: reply correlation).
                  const blockingSeq = topic.blockingTurnSeq != null ? Number(topic.blockingTurnSeq) : null
                  const clearsOperatorBlock =
                    topic.blockedOn === 'operator' &&
                    turnInput.kind === 'answer' &&
                    blockingSeq !== null &&
                    Number(turnInput.replyToSeq ?? Number.NaN) === blockingSeq

                  // Guard (e): while blocked on operator, reject every turn except the answer that
                  // replies to the blocking question.
                  if (topic.blockedOn === 'operator' && !clearsOperatorBlock) {
                    return discussionEffect(Effect.fail(blockedOnOperatorError(turnInput.topicId)))
                  }

                  // Guard (b): turn-order enforcement.
                  const turnOrder = topic.rules?.turnOrder
                  if (turnOrder && turnOrder.length > 0) {
                    const lastTurn = turns[turns.length - 1]
                    const expectedAgent = computeNextSpeaker(turnOrder, lastTurn?.agentId)
                    const actualAgent = normalizeNonEmpty(turnInput.agentId)
                    if (expectedAgent && actualAgent && expectedAgent !== actualAgent) {
                      return discussionEffect(
                        Effect.fail(turnOrderViolationError(turnInput.topicId, expectedAgent, actualAgent))
                      )
                    }
                  }

                  const assignedSeq = Number(topic.lastSeq ?? 0) + 1

                  // Guard (c): expect-next race guard.
                  if (expectedSeq !== undefined && Number(expectedSeq) !== assignedSeq) {
                    return discussionEffect(
                      Effect.fail(expectedSeqConflictError(turnInput.topicId, Number(expectedSeq), assignedSeq))
                    )
                  }

                  // Atomically bump topic.lastSeq + lastTurnAt, then insert the turn.
                  const topicPatch: Partial<IbmDiscussionTopic> = {
                    lastTurnAt: new Date(),
                    updatedBy: turnInput.createdBy,
                  }
                  // Guard (d): operator question blocks the topic.
                  if (turnInput.kind === 'question' && normalizeNonEmpty(turnInput.addressedTo) === 'operator') {
                    topicPatch.blockedOn = 'operator'
                    topicPatch.blockingTurnSeq = assignedSeq
                  } else if (clearsOperatorBlock) {
                    // The answer that replies to the blocking question clears the block.
                    topicPatch.blockedOn = null as any
                    topicPatch.blockingTurnSeq = null as any
                  }

                  return discussionTopicRepository.allocateNextSeq(turnInput.topicId, topicPatch).pipe(
                    Effect.mapError(mapDbError({ stage, operation: 'discussionTopicRepository.allocateNextSeq', factory: XfErrorFactory.upsertFailed })),
                    Effect.flatMap((updatedTopic) => {
                      const seq = Number(updatedTopic.lastSeq)
                      const payload: IbmDiscussionTurnInsert = {
                        ...turnInput,
                        seq,
                      } as IbmDiscussionTurnInsert
                      return discussionEffect(validateBmInputWithSchema({
                        input: payload,
                        schema: discussionTurnZodSchemaInsert,
                        stage,
                        operation: 'DiscussionService::addTurn.discussionTurnZodSchemaInsert',
                        field: 'data',
                      }).pipe(
                        Effect.flatMap((validated) =>
                          discussionTurnRepository.create(validated).pipe(
                            Effect.mapError(mapDbError({ stage, operation: 'discussionTurnRepository.create', factory: XfErrorFactory.createFailed }))
                          )
                        )
                      ))
                    })
                  )
                })
              )
            })
          )
        })
      }),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in addTurn')
        })
      )
    )
  }

  conclude(topicId: string, updatedBy?: string): Effect.Effect<IbmDiscussionTopic, DiscussionServiceError> {
    const stage = 'DiscussionService::conclude'
    return pipe(
      validateInput(topicId, 'topicId', { stage }),
      Effect.flatMap((id) =>
        this.runWriteEffect(({ discussionTopicRepository, discussionTurnRepository }) =>
          Effect.all({
            topic: this.requireTopic(discussionTopicRepository, id, stage),
            turns: this.listTurnsForTopic(discussionTurnRepository, id, stage),
          }).pipe(
            Effect.flatMap(({ topic, turns }) => {
              const readiness = evaluateConcludeReadiness(topic, turns)
              if (!readiness.canConclude) {
                return discussionEffect(Effect.fail(concludeBlockedError(id, readiness.reason)))
              }
              const patch: Partial<IbmDiscussionTopic> = { status: 'concluded' as DiscussionTopicStatus }
              if (updatedBy !== undefined) patch.updatedBy = updatedBy
              return discussionTopicRepository.patchById(id, patch).pipe(
                Effect.mapError(mapDbError({ stage, operation: 'discussionTopicRepository.patchById(conclude)', factory: XfErrorFactory.upsertFailed }))
              )
            })
          )
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in conclude')
        })
      )
    )
  }

  abandon(topicId: string, reason?: string): Effect.Effect<IbmDiscussionTopic, DiscussionServiceError> {
    const stage = 'DiscussionService::abandon'
    return pipe(
      validateInput(topicId, 'topicId', { stage }),
      Effect.flatMap((id) =>
        this.runWriteEffect(({ discussionTopicRepository }) =>
          this.requireTopic(discussionTopicRepository, id, stage).pipe(
            Effect.flatMap((topic) => {
              // GUARD: only an active topic can be abandoned.
              if (topic.status !== 'active') {
                return discussionEffect(Effect.fail(abandonBlockedError(id, String(topic.status))))
              }
              const patch: Partial<IbmDiscussionTopic> = { status: 'abandoned' as DiscussionTopicStatus }
              const abandonReason = normalizeNonEmpty(reason)
              if (abandonReason !== undefined) patch.abandonReason = abandonReason
              return discussionTopicRepository.patchById(id, patch).pipe(
                Effect.mapError(mapDbError({ stage, operation: 'discussionTopicRepository.patchById(abandon)', factory: XfErrorFactory.upsertFailed }))
              )
            })
          )
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in abandon')
        })
      )
    )
  }

  setOutput(data: DiscussionOutputSetInput): Effect.Effect<IbmDiscussionOutput, DiscussionServiceError> {
    const stage = 'DiscussionService::setOutput'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((input) =>
        this.runWriteEffect(({ discussionTopicRepository, discussionOutputRepository }) =>
          this.requireTopic(discussionTopicRepository, input.topicId, stage).pipe(
            Effect.flatMap((topic) => {
              const ownerAgentId = normalizeNonEmpty(input.ownerAgentId)
              const content = normalizeNonEmpty(input.content)
              const outputKind = normalizeNonEmpty(input.outputKind)
              if (!ownerAgentId) {
                return discussionEffect(Effect.fail(XfErrorFactory.inputRequired({ field: 'ownerAgentId', stage })))
              }
              if (!outputKind) {
                return discussionEffect(Effect.fail(XfErrorFactory.inputRequired({ field: 'outputKind', stage })))
              }
              if (!content) {
                return discussionEffect(Effect.fail(XfErrorFactory.inputRequired({ field: 'content', stage })))
              }
              // VALIDATE: content must not contain the _TBD_ marker.
              if (input.content.includes(OUTPUT_TBD_MARKER)) {
                return discussionEffect(Effect.fail(outputTbdError(input.topicId, outputKind)))
              }
              // VALIDATE: ownerAgentId must be a participant.
              const participants = (topic.participants ?? [])
                .map((id) => normalizeNonEmpty(id))
                .filter((id): id is string => Boolean(id))
              if (!participants.includes(ownerAgentId)) {
                return discussionEffect(Effect.fail(outputOwnerNotParticipantError(input.topicId, ownerAgentId)))
              }

              const payload: IbmDiscussionOutputInsert = {
                ...input,
                scopeId: input.scopeId ?? topic.scopeId,
              } as IbmDiscussionOutputInsert

              return discussionEffect(validateBmInputWithSchema({
                input: payload,
                schema: discussionOutputZodSchemaInsert,
                stage,
                operation: 'DiscussionService::setOutput.discussionOutputZodSchemaInsert',
                field: 'data',
              }).pipe(
                Effect.flatMap((validated) =>
                  discussionOutputRepository.upsert(validated as IbmDiscussionOutput, {
                    topicId: input.topicId,
                    outputKind,
                  } as any).pipe(
                    Effect.mapError(mapDbError({ stage, operation: 'discussionOutputRepository.upsert', factory: XfErrorFactory.upsertFailed }))
                  )
                )
              ))
            })
          )
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in setOutput')
        })
      )
    )
  }

  status(topicId: string): Effect.Effect<DiscussionStatus, DiscussionServiceError> {
    const stage = 'DiscussionService::status'
    return pipe(
      validateInput(topicId, 'topicId', { stage }),
      Effect.flatMap((id) =>
        Effect.all({
          topic: this.requireTopic(this.discussionTopicRepository, id, stage),
          turns: this.listTurnsForTopic(this.discussionTurnRepository, id, stage),
        }).pipe(
          Effect.map(({ topic, turns }) => {
            const ordered = sortTurnsBySeq(turns)
            const lastTurn = ordered[ordered.length - 1]
            const turnOrder = topic.rules?.turnOrder
            const nextSpeaker = computeNextSpeaker(turnOrder, lastTurn?.agentId)
            const readiness = evaluateConcludeReadiness(topic, ordered)
            const openQuestions = computeOpenQuestions(ordered)
            const blockedOn: DiscussionBlockedOn | null = topic.blockedOn === 'operator' ? 'operator' : null
            const reason = blockedOn
              ? `blocked_on_operator:turn=${topic.blockingTurnSeq ?? ''}`
              : topic.status !== 'active'
                ? `status:${topic.status}`
                : readiness.reason
            return {
              topicId: id,
              status: topic.status,
              blockedOn,
              nextSpeaker,
              canConclude: topic.status === 'active' && readiness.canConclude,
              openQuestions,
              reason,
            }
          })
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in status')
        })
      )
    )
  }
}
