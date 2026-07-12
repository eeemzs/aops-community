import { createHash } from 'node:crypto'
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
  IRepositoryPortChatMessage,
  IRepositoryPortChatRoom,
  IRepositoryPortChatRoomBinding,
  IRepositoryPortChatRoomMember,
  IRepositoryPortScope,
} from '../ports/repository-ports/index.js'
import type {
  ChatBindingCreateInput,
  ChatCatchupInput,
  ChatCatchupResult,
  ChatManifestExportInput,
  ChatMarkReadInput,
  ChatMemberCreateInput,
  ChatMemberRemoveInput,
  ChatMessageListFilter,
  ChatMessageSendInput,
  ChatOpenDmInput,
  ChatRoomCatchup,
  ChatRoomCreateInput,
  ChatRoomListFilter,
  ChatRoomManifest,
  IChatServicePort,
} from '../ports/inbound/index.js'
import { ChatServiceError } from '../errors/ChatServiceError.js'
import {
  IbmChatMessage,
  IbmChatMessageInsert,
  IbmChatRoom,
  IbmChatRoomBinding,
  IbmChatRoomInsert,
  IbmChatRoomMember,
  IbmChatRoomMemberInsert,
  chatMessageZodSchemaInsert,
  chatRoomBindingZodSchemaInsert,
  chatRoomMemberZodSchemaInsert,
  chatRoomZodSchemaInsert,
} from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { listRecordsByScopeResolution } from './service.scope-resolution.js'

const DEFAULT_MEMBER_ROLE = 'participant'

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeNonNegativeInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value
  if (typeof value !== 'string') return undefined
  const parsed = Number(value.trim())
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function sortUniqueAgentIds(agentIds: readonly string[]): string[] {
  return Array.from(new Set(agentIds.map((id) => normalizeNonEmpty(id)).filter((id): id is string => Boolean(id))))
    .sort((a, b) => a.localeCompare(b))
}

function buildDmKey(agentIds: readonly string[]): string {
  return sortUniqueAgentIds(agentIds).join('|')
}

function buildDmSlug(scopeId: string, dmKey: string): string {
  const hash = createHash('sha1').update(`${scopeId}|${dmKey}`).digest('hex').slice(0, 16)
  return `dm-${hash}`
}

function defaultMessageOptions(
  options?: DbQueryOptions<IbmChatMessage>
): DbQueryOptions<IbmChatMessage> {
  return {
    ...options,
    sort: (options as any)?.sort ?? ([{ field: 'seq', type: 'asc' }] as any),
  } as DbQueryOptions<IbmChatMessage>
}

function withoutPagination<T>(options?: DbQueryOptions<T>): DbQueryOptions<T> | undefined {
  if (!options) return undefined
  const next = { ...(options as Record<string, unknown>) }
  delete next.limit
  delete next.offset
  return next as DbQueryOptions<T>
}

function applyOptionsLimit<T>(rows: T[], options?: DbQueryOptions<T>): T[] {
  const offset = Number((options as Record<string, unknown> | undefined)?.offset)
  const limit = Number((options as Record<string, unknown> | undefined)?.limit)
  const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.trunc(offset) : 0
  const safeLimit = Number.isFinite(limit) && limit >= 0 ? Math.trunc(limit) : undefined
  const paged = safeOffset > 0 ? rows.slice(safeOffset) : rows
  return safeLimit === undefined ? paged : paged.slice(0, safeLimit)
}

type ChatWriteDeps = {
  chatRoomRepository: IRepositoryPortChatRoom
  chatRoomMemberRepository: IRepositoryPortChatRoomMember
  chatRoomBindingRepository: IRepositoryPortChatRoomBinding
  chatMessageRepository: IRepositoryPortChatMessage
}

function chatEffect<T>(effect: Effect.Effect<T, unknown, unknown>): Effect.Effect<T, ChatServiceError> {
  return effect as unknown as Effect.Effect<T, ChatServiceError>
}

function archivedRoomError(roomId: string): Error {
  return new Error(`agentspace.conflict:chat_room_archived:${roomId}`)
}

export interface ChatServiceDependencies {}

export interface ChatServiceOptions extends ChatWriteDeps {
  scopeRepository?: IRepositoryPortScope
  unitOfWork?: IUnitOfWork
  serviceDependencies?: Partial<ChatServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class ChatService implements IChatServicePort {
  private readonly chatRoomRepository: IRepositoryPortChatRoom
  private readonly chatRoomMemberRepository: IRepositoryPortChatRoomMember
  private readonly chatRoomBindingRepository: IRepositoryPortChatRoomBinding
  private readonly chatMessageRepository: IRepositoryPortChatMessage
  private readonly scopeRepository?: IRepositoryPortScope
  private readonly unitOfWork?: IUnitOfWork
  private readonly logger?: XfLogger

  constructor(options: ChatServiceOptions) {
    this.chatRoomRepository = options.chatRoomRepository
    this.chatRoomMemberRepository = options.chatRoomMemberRepository
    this.chatRoomBindingRepository = options.chatRoomBindingRepository
    this.chatMessageRepository = options.chatMessageRepository
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
    program: () => Effect.Effect<R, ChatServiceError>
  ): Effect.Effect<R, ChatServiceError> {
    const scoped: IRepositoryBase[] = []
    if (this.bindRepositoryContext(this.chatRoomRepository, ctx)) scoped.push(this.chatRoomRepository)
    if (this.bindRepositoryContext(this.chatRoomMemberRepository, ctx)) scoped.push(this.chatRoomMemberRepository)
    if (this.bindRepositoryContext(this.chatRoomBindingRepository, ctx)) scoped.push(this.chatRoomBindingRepository)
    if (this.bindRepositoryContext(this.chatMessageRepository, ctx)) scoped.push(this.chatMessageRepository)

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

  private runWriteEffect<R>(program: (deps: ChatWriteDeps) => Effect.Effect<R, ChatServiceError>): Effect.Effect<R, ChatServiceError> {
    const deps: ChatWriteDeps = {
      chatRoomRepository: this.chatRoomRepository,
      chatRoomMemberRepository: this.chatRoomMemberRepository,
      chatRoomBindingRepository: this.chatRoomBindingRepository,
      chatMessageRepository: this.chatMessageRepository,
    }

    if (!this.unitOfWork) {
      return program(deps)
    }

    return runInTransactionEffect(this.unitOfWork, (ctx) =>
      this.withRepositoryContext(ctx, () => program(deps))
    )
  }

  private resolveRoomCreateInput(data: ChatRoomCreateInput): IbmChatRoomInsert {
    const { members: _members, bindings: _bindings, ...roomData } = data
    void _members
    void _bindings
    return {
      ...roomData,
      kind: roomData.kind ?? 'group',
      status: roomData.status ?? 'active',
      lastSeq: Number.isInteger(roomData.lastSeq) ? Number(roomData.lastSeq) : 0,
    } as IbmChatRoomInsert
  }

  private resolveRoomCreateMembers(data: ChatRoomCreateInput, roomPayload: IbmChatRoomInsert): ChatMemberCreateInput[] {
    const members = [...(data.members ?? [])]
    const creatorAgentId = normalizeNonEmpty(roomPayload.createdBy)
    if (creatorAgentId && !members.some((member) => normalizeNonEmpty(member.agentId) === creatorAgentId)) {
      members.unshift({
        scopeId: roomPayload.scopeId,
        roomId: '__pending_room_id__',
        agentId: creatorAgentId,
        roleKey: 'creator',
        status: 'active',
        lastReadSeq: 0,
        joinedAt: new Date(),
        createdBy: roomPayload.createdBy,
        updatedBy: roomPayload.updatedBy,
      })
    }
    return members
  }

  private resolveMemberCreateInput(data: ChatMemberCreateInput): IbmChatRoomMemberInsert {
    return {
      ...data,
      roleKey: normalizeNonEmpty(data.roleKey) ?? DEFAULT_MEMBER_ROLE,
      status: data.status ?? 'active',
      lastReadSeq: Number.isInteger(data.lastReadSeq) ? Number(data.lastReadSeq) : 0,
      joinedAt: data.joinedAt ?? new Date(),
    } as IbmChatRoomMemberInsert
  }

  private findMemberByRoomAgent(
    repository: IRepositoryPortChatRoomMember,
    roomId: string,
    agentId: string,
    stage: string
  ): Effect.Effect<IbmChatRoomMember | null, ChatServiceError> {
    return repository.find({ matchEq: { roomId, agentId }, options: { limit: 1 } } as any).pipe(
      Effect.map((rows) => rows[0] ?? null),
      Effect.mapError(mapDbError({ stage, operation: 'chatRoomMemberRepository.find', factory: XfErrorFactory.notFound }))
    )
  }

  private findMessageByIdempotency(
    repository: IRepositoryPortChatMessage,
    roomId: string,
    idempotencyKey: string,
    stage: string
  ): Effect.Effect<IbmChatMessage | null, ChatServiceError> {
    return repository.find({ matchEq: { roomId, idempotencyKey }, options: { limit: 1 } } as any).pipe(
      Effect.map((rows) => rows[0] ?? null),
      Effect.mapError(mapDbError({ stage, operation: 'chatMessageRepository.find', factory: XfErrorFactory.notFound }))
    )
  }

  private requireRoom(
    repository: IRepositoryPortChatRoom,
    roomId: string,
    stage: string
  ): Effect.Effect<IbmChatRoom, ChatServiceError> {
    return repository.findById(roomId).pipe(
      Effect.mapError(mapDbError({ stage, operation: 'chatRoomRepository.findById', factory: XfErrorFactory.notFound })),
      Effect.flatMap((room) =>
        room
          ? Effect.succeed(room)
          : Effect.fail(XfErrorFactory.notFound({ stage, identifier: roomId }))
      )
    )
  }

  private ensureMember(
    repository: IRepositoryPortChatRoomMember,
    data: ChatMemberCreateInput,
    stage: string
  ): Effect.Effect<IbmChatRoomMember, ChatServiceError> {
    const requestedRoleKey = normalizeNonEmpty(data.roleKey)
    const payload = this.resolveMemberCreateInput(data)
    return Effect.gen(this, function* (_) {
      const existing = yield* _(this.findMemberByRoomAgent(repository, payload.roomId, payload.agentId, stage))
      if (!existing?.id) {
        const validated = yield* _(chatEffect(validateBmInputWithSchema({
            input: payload,
            schema: chatRoomMemberZodSchemaInsert,
            stage,
            operation: 'ChatService::ensureMember.chatRoomMemberZodSchemaInsert',
            field: 'data',
          })))
        return yield* _(repository.create(validated).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'chatRoomMemberRepository.create', factory: XfErrorFactory.createFailed }))
        ))
      }

      const patch: Partial<IbmChatRoomMember> = {
        roleKey: requestedRoleKey ?? existing.roleKey ?? payload.roleKey,
        status: 'active',
        lastReadSeq: Math.max(Number(existing.lastReadSeq ?? 0), Number(payload.lastReadSeq ?? 0)),
      }
      if (payload.brief !== undefined) patch.brief = payload.brief
      if (payload.updatedBy !== undefined || payload.createdBy !== undefined) {
        patch.updatedBy = payload.updatedBy ?? payload.createdBy
      }

      return yield* _(repository.patchById(existing.id, patch).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'chatRoomMemberRepository.patchById', factory: XfErrorFactory.upsertFailed }))
      ))
    })
  }

  getRoomById(id: string, options?: DbQueryOptions<IbmChatRoom>): Effect.Effect<IbmChatRoom | null, ChatServiceError> {
    const stage = 'ChatService::getRoomById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((value) =>
        this.chatRoomRepository.findById(value, options).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in getRoomById')
        })
      )
    )
  }

  createRoom(data: ChatRoomCreateInput): Effect.Effect<IbmChatRoom, ChatServiceError> {
    const stage = 'ChatService::createRoom'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((input) =>
        this.runWriteEffect(({ chatRoomRepository, chatRoomMemberRepository, chatRoomBindingRepository }) => {
          const roomPayload = this.resolveRoomCreateInput(input)
          const members = this.resolveRoomCreateMembers(input, roomPayload)
          if (members.length === 0) {
            return Effect.fail(XfErrorFactory.inputRequired({ field: 'members|createdBy', stage }))
          }
          return validateBmInputWithSchema({
            input: roomPayload,
            schema: chatRoomZodSchemaInsert,
            stage,
            operation: 'ChatService::createRoom.chatRoomZodSchemaInsert',
            field: 'data',
          }).pipe(
            Effect.flatMap((validated) =>
              chatRoomRepository.create(validated).pipe(
                Effect.mapError(mapDbError({ stage, operation: 'chatRoomRepository.create', factory: XfErrorFactory.createFailed }))
              )
            ),
            Effect.flatMap((room) => {
              const roomId = normalizeNonEmpty(room.id)
              if (!roomId) {
                return Effect.fail(XfErrorFactory.createFailed({ stage, operation: 'chatRoomRepository.create.id' }))
              }

              const bindings = input.bindings ?? []
              return Effect.forEach(
                members,
                (member) =>
                  this.ensureMember(
                    chatRoomMemberRepository,
                    {
                      ...member,
                      scopeId: room.scopeId,
                      roomId,
                    },
                    stage
                  ),
                { concurrency: 1 }
              ).pipe(
                Effect.flatMap(() =>
                  Effect.forEach(
                    bindings,
                    (binding) =>
                      this.addBindingWithRepository(
                        chatRoomBindingRepository,
                        {
                          ...binding,
                          scopeId: room.scopeId,
                          roomId,
                        },
                        stage
                      ),
                    { concurrency: 1 }
                  )
                ),
                Effect.as(room)
              )
            })
          )
        })
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in createRoom')
        })
      )
    )
  }

  listRooms(
    filter: ChatRoomListFilter = {},
    options?: DbQueryOptions<IbmChatRoom>
  ): Effect.Effect<IbmChatRoom[], ChatServiceError> {
    const stage = 'ChatService::listRooms'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((value) =>
        listRecordsByScopeResolution(this.chatRoomRepository as any, this.scopeRepository, value, options, {
          stage,
          defaultResolution: 'explicit',
        }).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'chatRoomRepository.find', factory: XfErrorFactory.notFound }))
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in listRooms')
        })
      )
    )
  }

  updateRoom(id: string, patch: Partial<IbmChatRoom>): Effect.Effect<IbmChatRoom, ChatServiceError> {
    const stage = 'ChatService::updateRoom'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((roomId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: chatRoomZodSchemaInsert.partial().strict(),
          stage,
          operation: 'ChatService::updateRoom.chatRoomZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(Effect.map(() => roomId))
      ),
      Effect.flatMap((roomId) =>
        this.chatRoomRepository.patchById(roomId, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'chatRoomRepository.patchById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateRoom')
        })
      )
    )
  }

  archiveRoom(id: string, updatedBy?: string): Effect.Effect<IbmChatRoom, ChatServiceError> {
    const patch: Partial<IbmChatRoom> = { status: 'archived' }
    if (updatedBy !== undefined) patch.updatedBy = updatedBy
    return this.updateRoom(id, patch)
  }

  openDm(data: ChatOpenDmInput): Effect.Effect<IbmChatRoom, ChatServiceError> {
    const stage = 'ChatService::openDm'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((input) => {
        const agents = sortUniqueAgentIds(input.agentIds ?? [])
        const scopeId = normalizeNonEmpty(input.scopeId)
        if (!scopeId) return Effect.fail(XfErrorFactory.inputRequired({ field: 'scopeId', stage }))
        if (agents.length !== 2) return Effect.fail(XfErrorFactory.inputRequired({ field: 'agentIds[2]', stage }))

        const dmKey = buildDmKey(agents)
        const slug = buildDmSlug(scopeId, dmKey)
        const title = normalizeNonEmpty(input.title) ?? agents.join(' / ')

        return this.runWriteEffect(({ chatRoomRepository, chatRoomMemberRepository }) =>
          chatRoomRepository.find({ matchEq: { scopeId, dmKey }, options: { limit: 1 } } as any).pipe(
            Effect.mapError(mapDbError({ stage, operation: 'chatRoomRepository.find(dmKey)', factory: XfErrorFactory.notFound })),
            Effect.flatMap((rooms) => {
              const existing = rooms[0]
              const roomEffect = existing?.id
                ? existing.status === 'active'
                  ? Effect.succeed(existing)
                  : chatRoomRepository.patchById(existing.id, { status: 'active', updatedBy: input.updatedBy }).pipe(
                      Effect.mapError(mapDbError({ stage, operation: 'chatRoomRepository.patchById(reopen)', factory: XfErrorFactory.upsertFailed }))
                    )
                : this.createRoomWithRepository(chatRoomRepository, {
                    scopeId,
                    projectId: input.projectId,
                    slug,
                    title,
                    kind: 'dm',
                    purpose: input.purpose,
                    guidanceMarkdown: input.guidanceMarkdown,
                    status: 'active',
                    dmKey,
                    lastSeq: 0,
                    createdBy: input.createdBy,
                    updatedBy: input.updatedBy,
                  }, stage)

              return roomEffect.pipe(
                Effect.flatMap((room) => {
                  const roomId = normalizeNonEmpty(room.id)
                  if (!roomId) return Effect.fail(XfErrorFactory.notFound({ stage, identifier: 'chatRoom.id' }))
                  return Effect.forEach(
                    agents,
                    (agentId) =>
                      this.ensureMember(
                        chatRoomMemberRepository,
                        {
                          scopeId,
                          roomId,
                          agentId,
                          roleKey: input.roles?.[agentId],
                          status: 'active',
                          lastReadSeq: 0,
                          joinedAt: new Date(),
                          createdBy: input.createdBy,
                          updatedBy: input.updatedBy,
                        },
                        stage
                      ),
                    { concurrency: 1 }
                  ).pipe(Effect.as(room))
                })
              )
            })
          )
        )
      }),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in openDm')
        })
      )
    )
  }

  exportManifest(data: ChatManifestExportInput): Effect.Effect<ChatRoomManifest, ChatServiceError> {
    const stage = 'ChatService::exportManifest'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((input) =>
        this.requireRoom(this.chatRoomRepository, input.roomId, stage).pipe(
          Effect.flatMap((room) =>
            Effect.all({
              members: this.chatRoomMemberRepository.find({ matchEq: { roomId: room.id }, options: { sort: [{ field: 'agentId', type: 'asc' }] } } as any).pipe(
                Effect.mapError(mapDbError({ stage, operation: 'chatRoomMemberRepository.find', factory: XfErrorFactory.notFound }))
              ),
              bindings: this.chatRoomBindingRepository.find({ matchEq: { roomId: room.id }, options: { sort: [{ field: 'bindingType', type: 'asc' }] } } as any).pipe(
                Effect.mapError(mapDbError({ stage, operation: 'chatRoomBindingRepository.find', factory: XfErrorFactory.notFound }))
              ),
              messages: input.includeMessages
                ? this.listMessages({ roomId: room.id })
                : Effect.succeed(undefined),
            }).pipe(
              Effect.map(({ members, bindings, messages }) => ({
                exportedAt: new Date().toISOString(),
                room,
                members,
                bindings,
                ...(messages ? { messages } : {}),
              }))
            )
          )
        )
      )
    )
  }

  addMember(data: ChatMemberCreateInput): Effect.Effect<IbmChatRoomMember, ChatServiceError> {
    const stage = 'ChatService::addMember'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((input) =>
        this.runWriteEffect(({ chatRoomMemberRepository }) =>
          this.ensureMember(chatRoomMemberRepository, input, stage)
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in addMember')
        })
      )
    )
  }

  updateMember(id: string, patch: Partial<IbmChatRoomMember>): Effect.Effect<IbmChatRoomMember, ChatServiceError> {
    const stage = 'ChatService::updateMember'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((memberId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: chatRoomMemberZodSchemaInsert.partial().strict(),
          stage,
          operation: 'ChatService::updateMember.chatRoomMemberZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(Effect.map(() => memberId))
      ),
      Effect.flatMap((memberId) =>
        this.chatRoomMemberRepository.patchById(memberId, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'chatRoomMemberRepository.patchById', factory: XfErrorFactory.upsertFailed }))
        )
      )
    )
  }

  removeMember(data: ChatMemberRemoveInput): Effect.Effect<IbmChatRoomMember, ChatServiceError> {
    const stage = 'ChatService::removeMember'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((input) =>
        this.runWriteEffect(({ chatRoomMemberRepository }) => {
          const memberEffect = normalizeNonEmpty(input.memberId)
            ? chatRoomMemberRepository.findById(input.memberId as string).pipe(
                Effect.mapError(mapDbError({ stage, operation: 'chatRoomMemberRepository.findById', factory: XfErrorFactory.notFound }))
              )
            : normalizeNonEmpty(input.roomId) && normalizeNonEmpty(input.agentId)
              ? this.findMemberByRoomAgent(chatRoomMemberRepository, input.roomId as string, input.agentId as string, stage).pipe(
                  Effect.flatMap((member) =>
                    member
                      ? Effect.succeed(member)
                      : Effect.fail(XfErrorFactory.notFound({ stage, identifier: `${input.roomId}:${input.agentId}` }))
                  )
                )
              : Effect.fail(XfErrorFactory.inputRequired({ field: 'memberId|roomId+agentId', stage }))

          return memberEffect.pipe(
            Effect.flatMap((member) => {
              if (!member?.id) return chatEffect(Effect.fail(XfErrorFactory.notFound({ stage, identifier: 'chatRoomMember.id' })))
              const patch: Partial<IbmChatRoomMember> = {
                status: 'left',
                leftAt: new Date(),
              }
              if (input.updatedBy !== undefined) patch.updatedBy = input.updatedBy
              return chatEffect(chatRoomMemberRepository.patchById(member.id, patch).pipe(
                Effect.mapError(mapDbError({ stage, operation: 'chatRoomMemberRepository.patchById(left)', factory: XfErrorFactory.upsertFailed }))
              ))
            })
          )
        })
      )
    )
  }

  private addBindingWithRepository(
    repository: IRepositoryPortChatRoomBinding,
    data: ChatBindingCreateInput,
    stage: string
  ): Effect.Effect<IbmChatRoomBinding, ChatServiceError> {
    return validateBmInputWithSchema({
      input: data,
      schema: chatRoomBindingZodSchemaInsert,
      stage,
      operation: 'ChatService::addBinding.chatRoomBindingZodSchemaInsert',
      field: 'data',
    }).pipe(
      Effect.flatMap((payload) =>
        repository.create(payload).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'chatRoomBindingRepository.create', factory: XfErrorFactory.createFailed }))
        )
      )
    )
  }

  addBinding(data: ChatBindingCreateInput): Effect.Effect<IbmChatRoomBinding, ChatServiceError> {
    const stage = 'ChatService::addBinding'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((input) =>
        this.runWriteEffect(({ chatRoomBindingRepository }) =>
          this.addBindingWithRepository(chatRoomBindingRepository, input, stage)
        )
      )
    )
  }

  removeBinding(id: string): Effect.Effect<void, ChatServiceError> {
    const stage = 'ChatService::removeBinding'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((bindingId) =>
        this.chatRoomBindingRepository.deleteById(bindingId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'chatRoomBindingRepository.deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined)
    )
  }

  sendMessage(data: ChatMessageSendInput): Effect.Effect<IbmChatMessage, ChatServiceError> {
    const stage = 'ChatService::sendMessage'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((input): Effect.Effect<IbmChatMessage, ChatServiceError> => {
        const idempotencyKey = normalizeNonEmpty(input.idempotencyKey)
        return this.runWriteEffect<IbmChatMessage>(({ chatRoomRepository, chatRoomMemberRepository, chatMessageRepository }) => {
          const existingEffect = idempotencyKey
            ? this.findMessageByIdempotency(chatMessageRepository, input.roomId, idempotencyKey, stage)
            : Effect.succeed(null)

          return existingEffect.pipe(
            Effect.flatMap((existing) => {
              if (existing) return Effect.succeed(existing)

              return this.findMemberByRoomAgent(chatRoomMemberRepository, input.roomId, input.authorAgentId, stage).pipe(
                Effect.flatMap((member) =>
                  member?.status === 'active'
                    ? Effect.succeed(member)
                    : Effect.fail(XfErrorFactory.notFound({ stage, identifier: `${input.roomId}:${input.authorAgentId}` }))
                ),
                Effect.flatMap(() =>
                  chatRoomRepository.findById(input.roomId).pipe(
                    Effect.mapError(mapDbError({ stage, operation: 'chatRoomRepository.findById', factory: XfErrorFactory.notFound })),
                    Effect.flatMap((room) =>
                      room.status === 'active'
                        ? Effect.succeed(room)
                        : chatEffect(Effect.fail(archivedRoomError(input.roomId)))
                    )
                  )
                ),
                Effect.flatMap(() =>
                  chatRoomRepository.allocateNextSeq(input.roomId, {
                    lastMessageAt: new Date(),
                    updatedBy: input.createdBy,
                  }).pipe(
                    Effect.mapError(mapDbError({ stage, operation: 'chatRoomRepository.allocateNextSeq', factory: XfErrorFactory.upsertFailed }))
                  )
                ),
                Effect.flatMap((room) => {
                  if (room.status !== 'active') {
                    return chatEffect(Effect.fail(archivedRoomError(input.roomId)))
                  }
                  const payload: IbmChatMessageInsert = {
                    ...input,
                    kind: input.kind ?? 'message',
                    seq: Number(room.lastSeq),
                  } as IbmChatMessageInsert
                  return chatEffect(validateBmInputWithSchema({
                    input: payload,
                    schema: chatMessageZodSchemaInsert,
                    stage,
                    operation: 'ChatService::sendMessage.chatMessageZodSchemaInsert',
                    field: 'data',
                  }).pipe(
                    Effect.flatMap((validated) =>
                      chatMessageRepository.create(validated).pipe(
                        Effect.mapError(mapDbError({ stage, operation: 'chatMessageRepository.create', factory: XfErrorFactory.createFailed }))
                      )
                    )
                  ))
                })
              )
            })
          )
        })
      }),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in sendMessage')
        })
      )
    )
  }

  listMessages(
    filter: ChatMessageListFilter = {},
    options?: DbQueryOptions<IbmChatMessage>
  ): Effect.Effect<IbmChatMessage[], ChatServiceError> {
    const stage = 'ChatService::listMessages'
    const { afterSeq, ...matchEq } = filter
    const normalizedAfterSeq = normalizeNonNegativeInt(afterSeq)
    const hasAfterSeq = normalizedAfterSeq !== undefined
    const repositoryOptions = hasAfterSeq
      ? withoutPagination(defaultMessageOptions(options))
      : defaultMessageOptions(options)
    return pipe(
      validateInput(matchEq, 'filter', { stage }),
      Effect.flatMap((validatedFilter) => {
        const roomId = normalizeNonEmpty((validatedFilter as Record<string, unknown>).roomId)
        if (hasAfterSeq && roomId) {
          const extraMatchEntries = Object.entries(validatedFilter as Record<string, unknown>).filter(
            ([key, value]) => key !== 'roomId' && value !== undefined
          )
          const rangeOptions = extraMatchEntries.length > 0
            ? withoutPagination(defaultMessageOptions(options))
            : defaultMessageOptions(options)
          return this.chatMessageRepository.listRoomMessagesAfterSeq(roomId, normalizedAfterSeq, rangeOptions).pipe(
            Effect.mapError(mapDbError({ stage, operation: 'chatMessageRepository.listRoomMessagesAfterSeq', factory: XfErrorFactory.notFound })),
            Effect.map((rows) => {
              const filtered = extraMatchEntries.length > 0
                ? rows.filter((row) => extraMatchEntries.every(([key, value]) => (row as Record<string, unknown>)[key] === value))
                : rows
              return extraMatchEntries.length > 0 ? applyOptionsLimit(filtered, options) : filtered
            })
          )
        }

        return this.chatMessageRepository.find({ matchEq: validatedFilter, options: repositoryOptions } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'chatMessageRepository.find', factory: XfErrorFactory.notFound })),
          Effect.map((rows) => {
            const filtered = hasAfterSeq
              ? rows.filter((row) => Number(row.seq ?? 0) > normalizedAfterSeq)
              : rows
            return hasAfterSeq ? applyOptionsLimit(filtered, options) : filtered
          })
        )
      }),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in listMessages')
        })
      )
    )
  }

  private catchupForMember(
    member: IbmChatRoomMember,
    agentId: string,
    limit: number | undefined,
    stage: string
  ): Effect.Effect<ChatRoomCatchup, ChatServiceError> {
    return this.requireRoom(this.chatRoomRepository, member.roomId, stage).pipe(
      Effect.flatMap((room) =>
        this.listMessages(
          { roomId: member.roomId, afterSeq: Number(member.lastReadSeq ?? 0) },
          limit ? ({ limit } as any) : undefined
        ).pipe(
          Effect.map((messages) => {
            const unreadMessages = messages.filter((message) => message.authorAgentId !== agentId)
            return {
              room,
              member,
              messages: unreadMessages,
              unreadCount: unreadMessages.length,
            }
          })
        )
      )
    )
  }

  catchup(data: ChatCatchupInput): Effect.Effect<ChatCatchupResult, ChatServiceError> {
    const stage = 'ChatService::catchup'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((input) => {
        const agentId = normalizeNonEmpty(input.agentId)
        if (!agentId) return Effect.fail(XfErrorFactory.inputRequired({ field: 'agentId', stage }))

        const roomId = normalizeNonEmpty(input.roomId)
        const membersEffect = roomId
          ? this.findMemberByRoomAgent(this.chatRoomMemberRepository, roomId, agentId, stage).pipe(
              Effect.flatMap((member) =>
                member
                  ? Effect.succeed([member])
                  : Effect.fail(XfErrorFactory.notFound({ stage, identifier: `${roomId}:${agentId}` }))
              )
            )
          : this.chatRoomMemberRepository.find({ matchEq: { agentId, status: 'active' }, options: { sort: [{ field: 'joinedAt', type: 'asc' }] } } as any).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'chatRoomMemberRepository.find(agent)', factory: XfErrorFactory.notFound }))
            )

        return membersEffect.pipe(
          Effect.flatMap((members) =>
            Effect.forEach(
              members,
              (member) => this.catchupForMember(member, agentId, input.limit, stage),
              { concurrency: 1 }
            )
          ),
          Effect.map((rooms) => ({
            agentId,
            rooms,
            unreadCount: rooms.reduce((total, room) => total + room.unreadCount, 0),
          }))
        )
      })
    )
  }

  markRead(data: ChatMarkReadInput): Effect.Effect<IbmChatRoomMember, ChatServiceError> {
    const stage = 'ChatService::markRead'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((input) =>
        this.runWriteEffect(({ chatRoomRepository, chatRoomMemberRepository }) =>
          chatEffect(this.requireRoom(chatRoomRepository, input.roomId, stage).pipe(
            Effect.flatMap((room) =>
              this.findMemberByRoomAgent(chatRoomMemberRepository, input.roomId, input.agentId, stage).pipe(
                Effect.flatMap((member) =>
                  member
                    ? Effect.succeed({ room, member })
                    : Effect.fail(XfErrorFactory.notFound({ stage, identifier: `${input.roomId}:${input.agentId}` }))
                )
              )
            ),
            Effect.flatMap(({ room, member }) => {
              if (!member.id) return chatEffect(Effect.fail(XfErrorFactory.notFound({ stage, identifier: 'chatRoomMember.id' })))
              const lastSeq = Number(room.lastSeq ?? 0)
              const requestedSeq = Math.min(input.seq ?? lastSeq, lastSeq)
              const patch: Partial<IbmChatRoomMember> = {
                lastReadSeq: Math.max(Number(member.lastReadSeq ?? 0), requestedSeq),
              }
              if (input.updatedBy !== undefined) patch.updatedBy = input.updatedBy
              return chatEffect(chatRoomMemberRepository.patchById(member.id, patch).pipe(
                Effect.mapError(mapDbError({ stage, operation: 'chatRoomMemberRepository.patchById(lastReadSeq)', factory: XfErrorFactory.upsertFailed }))
              ))
            })
          ))
        )
      )
    )
  }

  private createRoomWithRepository(
    repository: IRepositoryPortChatRoom,
    data: IbmChatRoomInsert,
    stage: string
  ): Effect.Effect<IbmChatRoom, ChatServiceError> {
    return validateBmInputWithSchema({
      input: data,
      schema: chatRoomZodSchemaInsert,
      stage,
      operation: 'ChatService::createRoomWithRepository.chatRoomZodSchemaInsert',
      field: 'data',
    }).pipe(
      Effect.flatMap((payload) =>
        repository.create(payload).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'chatRoomRepository.create', factory: XfErrorFactory.createFailed }))
        )
      )
    )
  }
}
