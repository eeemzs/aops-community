import { describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'

import { ChatService } from '../../../agentspace-dm/src/application/services/service.chat.js'
import { parseAgentspaceToolInput } from './tool-input.js'

type Row = Record<string, any> & { id?: string }

function makeRepo<T extends Row>(name: string, initialRows: T[] = []) {
  const rows = [...initialRows]
  let nextId = rows.length + 1

  const matches = (row: T, matchEq: Record<string, unknown> = {}) =>
    Object.entries(matchEq).every(([key, value]) => value === undefined || row[key] === value)

  const repo = {
    rows,
    create: vi.fn((data: T) => {
      const row = { ...data, id: data.id ?? `${name}-${nextId++}` } as T
      rows.push(row)
      return Effect.succeed(row)
    }),
    findById: vi.fn((id: string) => {
      const row = rows.find((item) => item.id === id)
      return row ? Effect.succeed(row) : Effect.fail(new Error(`${name} not found: ${id}`))
    }),
    find: vi.fn((params: { matchEq?: Record<string, unknown>; options?: any } = {}) => {
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

function makeService() {
  const roomRepo = makeRoomRepo([
    { id: 'room-1', scopeId: 'project-1', slug: 'main', title: 'Main', kind: 'group', status: 'active', lastSeq: 1 },
    { id: 'room-archive', scopeId: 'project-1', slug: 'archive-me', title: 'Archive Me', kind: 'group', status: 'active', lastSeq: 0 },
  ])
  const memberRepo = makeRepo('member', [
    {
      id: 'member-1',
      scopeId: 'project-1',
      roomId: 'room-1',
      agentId: 'codex',
      roleKey: 'implementer',
      status: 'active',
      lastReadSeq: 0,
      joinedAt: new Date('2026-06-10T00:00:00.000Z'),
    },
    {
      id: 'member-2',
      scopeId: 'project-1',
      roomId: 'room-1',
      agentId: 'claude',
      roleKey: 'reviewer',
      status: 'active',
      lastReadSeq: 0,
      joinedAt: new Date('2026-06-10T00:00:00.000Z'),
    },
  ])
  const bindingRepo = makeRepo('binding', [
    { id: 'binding-1', scopeId: 'project-1', roomId: 'room-1', bindingType: 'repo-url', uri: 'file:///repo' },
  ])
  const messageRepo = makeRepo('message', [
    { id: 'message-1', scopeId: 'project-1', roomId: 'room-1', seq: 1, authorAgentId: 'codex', kind: 'message', text: 'hello' },
  ])
  const service = new ChatService({
    chatRoomRepository: roomRepo as any,
    chatRoomMemberRepository: memberRepo as any,
    chatRoomBindingRepository: bindingRepo as any,
    chatMessageRepository: messageRepo as any,
  })
  return { service, roomRepo, memberRepo, bindingRepo, messageRepo }
}

describe('chat operation input schemas', () => {
  it('round-trips published chat input schemas into ChatService validation', async () => {
    const { service } = makeService()

    const createRoom = parseAgentspaceToolInput('chat-room.create', {
      data: { scopeId: 'project-1', slug: 'created-room', title: 'Created Room', createdBy: 'operator' },
    })
    await expect(Effect.runPromise(service.createRoom(createRoom.data))).resolves.toMatchObject({ slug: 'created-room' })

    const getRoom = parseAgentspaceToolInput('chat-room.get-by-id', { id: 'room-1' })
    await expect(Effect.runPromise(service.getRoomById(getRoom.id))).resolves.toMatchObject({ id: 'room-1' })

    const listRooms = parseAgentspaceToolInput('chat-room.list', { filter: { scopeId: 'project-1' } })
    await expect(Effect.runPromise(service.listRooms(listRooms.filter))).resolves.toEqual(expect.any(Array))

    const updateRoom = parseAgentspaceToolInput('chat-room.update', {
      id: 'room-1',
      patch: { title: 'Main Updated', updatedBy: 'operator' },
    })
    await expect(Effect.runPromise(service.updateRoom(updateRoom.id, updateRoom.patch))).resolves.toMatchObject({ title: 'Main Updated' })

    const openDm = parseAgentspaceToolInput('chat-room.open-dm', {
      data: { scopeId: 'project-1', agentIds: ['codex', 'claude'], roles: { codex: 'implementer', claude: 'reviewer' } },
    })
    await expect(Effect.runPromise(service.openDm(openDm.data))).resolves.toMatchObject({ kind: 'dm' })

    const exportManifest = parseAgentspaceToolInput('chat-room.export-manifest', {
      data: { roomId: 'room-1', includeMessages: true },
    })
    await expect(Effect.runPromise(service.exportManifest(exportManifest.data))).resolves.toMatchObject({ room: { id: 'room-1' } })

    const addMember = parseAgentspaceToolInput('chat-member.add', {
      data: { scopeId: 'project-1', roomId: 'room-1', agentId: 'operator', roleKey: 'operator' },
    })
    const addedMember = await Effect.runPromise(service.addMember(addMember.data))
    expect(addedMember).toMatchObject({ agentId: 'operator', roleKey: 'operator' })
    expect(addedMember.joinedAt).toBeInstanceOf(Date)

    const updateMember = parseAgentspaceToolInput('chat-member.update', {
      id: 'member-1',
      patch: { roleKey: 'lead-implementer', updatedBy: 'operator' },
    })
    await expect(Effect.runPromise(service.updateMember(updateMember.id, updateMember.patch))).resolves.toMatchObject({ roleKey: 'lead-implementer' })

    const addBinding = parseAgentspaceToolInput('chat-binding.add', {
      data: { scopeId: 'project-1', roomId: 'room-1', bindingType: 'doc', refId: 'doc-1' },
    })
    await expect(Effect.runPromise(service.addBinding(addBinding.data))).resolves.toMatchObject({ bindingType: 'doc' })

    const removeBinding = parseAgentspaceToolInput('chat-binding.remove', { id: 'binding-1' })
    await expect(Effect.runPromise(service.removeBinding(removeBinding.id))).resolves.toBeUndefined()

    const sendMessage = parseAgentspaceToolInput('chat-message.send', {
      data: { scopeId: 'project-1', roomId: 'room-1', authorAgentId: 'codex', text: 'schema to service' },
    })
    await expect(Effect.runPromise(service.sendMessage(sendMessage.data))).resolves.toMatchObject({ text: 'schema to service' })

    const listMessages = parseAgentspaceToolInput('chat-message.list', {
      filter: { roomId: 'room-1', afterSeq: 0 },
    })
    await expect(Effect.runPromise(service.listMessages(listMessages.filter))).resolves.toEqual(expect.any(Array))

    const catchup = parseAgentspaceToolInput('chat.catchup', { data: { agentId: 'claude', roomId: 'room-1', limit: 10 } })
    await expect(Effect.runPromise(service.catchup(catchup.data))).resolves.toMatchObject({ agentId: 'claude' })

    const markRead = parseAgentspaceToolInput('chat.mark-read', { data: { roomId: 'room-1', agentId: 'claude', updatedBy: 'operator' } })
    await expect(Effect.runPromise(service.markRead(markRead.data))).resolves.toMatchObject({ agentId: 'claude' })

    const removeMember = parseAgentspaceToolInput('chat-member.remove', {
      data: { roomId: 'room-1', agentId: 'operator', updatedBy: 'operator' },
    })
    await expect(Effect.runPromise(service.removeMember(removeMember.data))).resolves.toMatchObject({ agentId: 'operator', status: 'left' })

    const archiveRoom = parseAgentspaceToolInput('chat-room.archive', { id: 'room-archive', updatedBy: 'operator' })
    await expect(Effect.runPromise(service.archiveRoom(archiveRoom.id, archiveRoom.updatedBy))).resolves.toMatchObject({ status: 'archived' })
  })

  it('rejects server-managed fields before service dispatch', () => {
    expect(() =>
      parseAgentspaceToolInput('chat-message.send', {
        data: { scopeId: 'project-1', roomId: 'room-1', authorAgentId: 'codex', text: 'hello', updatedBy: 'operator' },
      } as any)
    ).toThrow(/additional properties/)

    expect(() =>
      parseAgentspaceToolInput('chat-room.create', {
        data: { scopeId: 'project-1', slug: 'bad-room', title: 'Bad Room', createdBy: 'operator', lastMessageAt: '2026-06-10T00:00:00.000Z' },
      } as any)
    ).toThrow(/additional properties/)

    expect(() =>
      parseAgentspaceToolInput('chat-room.create', {
        data: { scopeId: 'project-1', slug: 'bad-room', title: 'Bad Room', createdBy: 'operator', lastSeq: 1 },
      } as any)
    ).toThrow(/additional properties/)

    expect(() =>
      parseAgentspaceToolInput('chat-member.add', {
        data: { scopeId: 'project-1', roomId: 'room-1', agentId: 'codex', joinedAt: '2026-06-10T00:00:00.000Z' },
      } as any)
    ).toThrow(/additional properties/)

    expect(() =>
      parseAgentspaceToolInput('chat-member.update', {
        id: 'member-1',
        patch: { leftAt: '2026-06-10T00:00:00.000Z' },
      } as any)
    ).toThrow(/additional properties/)
  })
})
