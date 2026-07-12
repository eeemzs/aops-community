import { describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'

import { ChatService } from '../service.chat.js'

type Row = Record<string, any> & { id?: string }

function makeRepo<T extends Row>(name: string, initialRows: T[] = []) {
  const rows = [...initialRows]
  let nextId = rows.length + 1

  const matches = (row: T, matchEq: Record<string, unknown> = {}) =>
    Object.entries(matchEq).every(([key, value]) => row[key] === value)

  const repo = {
    rows,
    create: vi.fn((data: T) => {
      const row = { ...data, id: data.id ?? `${name}-${nextId++}` } as T
      rows.push(row)
      return Effect.succeed(row)
    }),
    findById: vi.fn((id: string) => {
      const row = rows.find((item) => item.id === id)
      if (!row) return Effect.fail(new Error(`${name} not found: ${id}`))
      return Effect.succeed(row)
    }),
    find: vi.fn((params: { matchEq?: Record<string, unknown>; options?: any }) => {
      let result = rows.filter((row) => matches(row, params.matchEq))
      const sort = params.options?.sort?.[0]
      if (sort?.field) {
        result = [...result].sort((a, b) => {
          const av = a[sort.field]
          const bv = b[sort.field]
          const cmp = av === bv ? 0 : av > bv ? 1 : -1
          return sort.type === 'desc' ? -cmp : cmp
        })
      }
      if (typeof params.options?.limit === 'number') {
        result = result.slice(0, params.options.limit)
      }
      return Effect.succeed(result)
    }),
    patchById: vi.fn((id: string, patch: Partial<T>) => {
      const index = rows.findIndex((item) => item.id === id)
      if (index < 0) return Effect.fail(new Error(`${name} not found: ${id}`))
      rows[index] = { ...rows[index], ...patch } as T
      return Effect.succeed(rows[index])
    }),
    deleteById: vi.fn((id: string) => {
      const index = rows.findIndex((item) => item.id === id)
      if (index >= 0) rows.splice(index, 1)
      return Effect.succeed(index >= 0 ? 1 : 0)
    }),
    listRoomMessagesAfterSeq: vi.fn((roomId: string, afterSeq: number, options?: any) => {
      let result = rows.filter((row) => row.roomId === roomId && Number(row.seq ?? 0) > afterSeq)
      const sort = options?.sort?.[0]
      if (sort?.field) {
        result = [...result].sort((a, b) => {
          const av = a[sort.field]
          const bv = b[sort.field]
          const cmp = av === bv ? 0 : av > bv ? 1 : -1
          return sort.type === 'desc' ? -cmp : cmp
        })
      }
      if (typeof options?.limit === 'number') {
        result = result.slice(0, options.limit)
      }
      return Effect.succeed(result)
    }),
  }

  return repo
}

function makeRoomRepo(initialRows: Row[] = []) {
  const repo = makeRepo('room', initialRows)
  return {
    ...repo,
    allocateNextSeq: vi.fn((roomId: string, patch: Row = {}) => {
      const room = repo.rows.find((item) => item.id === roomId)
      if (!room) return Effect.fail(new Error(`room not found: ${roomId}`))
      const next = Number(room.lastSeq ?? 0) + 1
      Object.assign(room, patch, { lastSeq: next })
      return Effect.succeed(room)
    }),
  }
}

function makeService(seed?: {
  rooms?: Row[]
  members?: Row[]
  bindings?: Row[]
  messages?: Row[]
}) {
  const roomRepo = makeRoomRepo(seed?.rooms)
  const memberRepo = makeRepo('member', seed?.members)
  const bindingRepo = makeRepo('binding', seed?.bindings)
  const messageRepo = makeRepo('message', seed?.messages)
  const service = new ChatService({
    chatRoomRepository: roomRepo as any,
    chatRoomMemberRepository: memberRepo as any,
    chatRoomBindingRepository: bindingRepo as any,
    chatMessageRepository: messageRepo as any,
  })
  return { service, roomRepo, memberRepo, bindingRepo, messageRepo }
}

describe('ChatService', () => {
  it('creates rooms with at least one member and auto-adds the creator', async () => {
    const { service, memberRepo } = makeService()

    const room = await Effect.runPromise(
      service.createRoom({
        scopeId: 'project-1',
        slug: 'group-chat',
        title: 'Group Chat',
        createdBy: 'codex',
      })
    )

    expect(room.kind).toBe('group')
    expect(memberRepo.rows).toHaveLength(1)
    expect(memberRepo.rows[0]).toMatchObject({
      scopeId: 'project-1',
      roomId: room.id,
      agentId: 'codex',
      roleKey: 'creator',
      status: 'active',
      lastReadSeq: 0,
    })

    await expect(
      Effect.runPromise(
        service.createRoom({
          scopeId: 'project-1',
          slug: 'empty-chat',
          title: 'Empty Chat',
        })
      )
    ).rejects.toBeDefined()
  })

  it('opens a deterministic DM once and reuses it on repeated calls', async () => {
    const { service, roomRepo, memberRepo } = makeService()

    const first = await Effect.runPromise(
      service.openDm({
        scopeId: 'project-1',
        agentIds: ['codex', 'claude'],
        roles: { codex: 'implementer', claude: 'reviewer' },
        createdBy: 'operator',
      })
    )
    const second = await Effect.runPromise(
      service.openDm({
        scopeId: 'project-1',
        agentIds: ['claude', 'codex'],
      })
    )

    expect(first.id).toBe(second.id)
    expect(first.kind).toBe('dm')
    expect(first.dmKey).toBe('claude|codex')
    expect(first.slug).toMatch(/^dm-/)
    expect(roomRepo.rows).toHaveLength(1)
    expect(memberRepo.rows).toHaveLength(2)
    expect(memberRepo.rows.map((row) => [row.agentId, row.roleKey]).sort()).toEqual([
      ['claude', 'reviewer'],
      ['codex', 'implementer'],
    ])
  })

  it('sends messages with room sequence allocation and idempotency replay', async () => {
    const { service, roomRepo, messageRepo } = makeService({
      rooms: [{ id: 'room-1', scopeId: 'project-1', slug: 'chat', title: 'Chat', kind: 'group', status: 'active', lastSeq: 0 }],
      members: [{ id: 'member-1', scopeId: 'project-1', roomId: 'room-1', agentId: 'codex', roleKey: 'implementer', status: 'active', lastReadSeq: 0, joinedAt: new Date() }],
    })

    const first = await Effect.runPromise(
      service.sendMessage({
        scopeId: 'project-1',
        roomId: 'room-1',
        authorAgentId: 'codex',
        text: 'S2 is moving.',
        idempotencyKey: 'idem-1',
      })
    )
    const replay = await Effect.runPromise(
      service.sendMessage({
        scopeId: 'project-1',
        roomId: 'room-1',
        authorAgentId: 'codex',
        text: 'S2 is moving.',
        idempotencyKey: 'idem-1',
      })
    )

    expect(first.id).toBe(replay.id)
    expect(first.seq).toBe(1)
    expect(first.kind).toBe('message')
    expect(roomRepo.rows[0].lastSeq).toBe(1)
    expect(roomRepo.allocateNextSeq).toHaveBeenCalledTimes(1)
    expect(messageRepo.rows).toHaveLength(1)
  })

  it('rejects archived-room sends before sequence allocation', async () => {
    const { service, roomRepo, messageRepo } = makeService({
      rooms: [{ id: 'room-1', scopeId: 'project-1', slug: 'chat', title: 'Chat', kind: 'group', status: 'archived', lastSeq: 19 }],
      members: [{ id: 'member-1', scopeId: 'project-1', roomId: 'room-1', agentId: 'codex', roleKey: 'implementer', status: 'active', lastReadSeq: 0, joinedAt: new Date() }],
    })

    await expect(
      Effect.runPromise(
        service.sendMessage({
          scopeId: 'project-1',
          roomId: 'room-1',
          authorAgentId: 'codex',
          text: 'after closeout',
        })
      )
    ).rejects.toThrow(/agentspace\.conflict:chat_room_archived:room-1/)

    expect(roomRepo.allocateNextSeq).not.toHaveBeenCalled()
    expect(roomRepo.rows[0].lastSeq).toBe(19)
    expect(messageRepo.rows).toHaveLength(0)
  })

  it('catches up after lastReadSeq and marks the room read', async () => {
    const { service, memberRepo, messageRepo } = makeService({
      rooms: [
        { id: 'room-1', scopeId: 'project-1', slug: 'chat', title: 'Chat', kind: 'group', status: 'active', lastSeq: 4 },
        { id: 'room-2', scopeId: 'project-1', slug: 'dm', title: 'DM', kind: 'dm', status: 'active', lastSeq: 1 },
      ],
      members: [
        { id: 'member-1', scopeId: 'project-1', roomId: 'room-1', agentId: 'claude', roleKey: 'reviewer', status: 'active', lastReadSeq: 1, joinedAt: new Date() },
        { id: 'member-2', scopeId: 'project-1', roomId: 'room-2', agentId: 'claude', roleKey: 'reviewer', status: 'active', lastReadSeq: 0, joinedAt: new Date() },
      ],
      messages: [
        { id: 'm1', scopeId: 'project-1', roomId: 'room-1', seq: 1, authorAgentId: 'codex', kind: 'message', text: 'one' },
        { id: 'm2', scopeId: 'project-1', roomId: 'room-1', seq: 2, authorAgentId: 'codex', kind: 'message', text: 'two' },
        { id: 'm3', scopeId: 'project-1', roomId: 'room-1', seq: 3, authorAgentId: 'codex', kind: 'message', text: 'three' },
        { id: 'm4', scopeId: 'project-1', roomId: 'room-1', seq: 4, authorAgentId: 'claude', kind: 'message', text: 'self' },
        { id: 'm5', scopeId: 'project-1', roomId: 'room-2', seq: 1, authorAgentId: 'codex', kind: 'message', text: 'dm' },
      ],
    })

    const before = await Effect.runPromise(service.catchup({ agentId: 'claude' }))
    const marked = await Effect.runPromise(service.markRead({ roomId: 'room-1', agentId: 'claude' }))
    const clamped = await Effect.runPromise(service.markRead({ roomId: 'room-2', agentId: 'claude', seq: 99 }))
    const after = await Effect.runPromise(service.catchup({ roomId: 'room-1', agentId: 'claude' }))

    expect(before.rooms).toHaveLength(2)
    expect(before.rooms.find((room) => room.room.id === 'room-1')?.messages.map((message) => message.seq)).toEqual([2, 3])
    expect(before.rooms.find((room) => room.room.id === 'room-2')?.messages.map((message) => message.seq)).toEqual([1])
    expect(before.unreadCount).toBe(3)
    expect(marked.lastReadSeq).toBe(4)
    expect(memberRepo.rows[0].lastReadSeq).toBe(4)
    expect(clamped.lastReadSeq).toBe(1)
    expect(memberRepo.rows[1].lastReadSeq).toBe(1)
    expect(messageRepo.listRoomMessagesAfterSeq).toHaveBeenCalled()
    expect(after.rooms[0].messages).toEqual([])
    expect(after.unreadCount).toBe(0)
  })
})
