import { describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'

import { DiscussionService } from '../service.discussion.js'

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
    upsert: vi.fn((data: T, matchEq: Record<string, unknown> = {}) => {
      const index = rows.findIndex((item) => matches(item, matchEq))
      if (index >= 0) {
        rows[index] = { ...rows[index], ...data } as T
        return Effect.succeed(rows[index])
      }
      const row = { ...data, id: data.id ?? `${name}-${nextId++}` } as T
      rows.push(row)
      return Effect.succeed(row)
    }),
    deleteById: vi.fn((id: string) => {
      const index = rows.findIndex((item) => item.id === id)
      if (index >= 0) rows.splice(index, 1)
      return Effect.succeed(index >= 0 ? 1 : 0)
    }),
    listTopicTurnsAfterSeq: vi.fn((topicId: string, afterSeq: number, options?: any) => {
      let result = rows.filter((row) => row.topicId === topicId && Number(row.seq ?? 0) > afterSeq)
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

function makeTopicRepo(initialRows: Row[] = []) {
  const repo = makeRepo('topic', initialRows)
  return {
    ...repo,
    allocateNextSeq: vi.fn((topicId: string, patch: Row = {}) => {
      const topic = repo.rows.find((item) => item.id === topicId)
      if (!topic) return Effect.fail(new Error(`topic not found: ${topicId}`))
      const next = Number(topic.lastSeq ?? 0) + 1
      Object.assign(topic, patch, { lastSeq: next })
      return Effect.succeed(topic)
    }),
  }
}

function makeService(seed?: {
  topics?: Row[]
  turns?: Row[]
  outputs?: Row[]
}) {
  const topicRepo = makeTopicRepo(seed?.topics)
  const turnRepo = makeRepo('turn', seed?.turns)
  const outputRepo = makeRepo('output', seed?.outputs)
  const service = new DiscussionService({
    discussionTopicRepository: topicRepo as any,
    discussionTurnRepository: turnRepo as any,
    discussionOutputRepository: outputRepo as any,
  })
  return { service, topicRepo, turnRepo, outputRepo }
}

function seedTopic(overrides: Row = {}): Row {
  return {
    id: 'topic-1',
    scopeId: 'project-1',
    slug: 'design-x',
    title: 'Design X',
    question: 'Which design?',
    participants: ['codex', 'claude'],
    initiatorAgentId: 'codex',
    status: 'active',
    lastSeq: 0,
    ...overrides,
  }
}

describe('DiscussionService', () => {
  it('creates a topic with status active and lastSeq 0', async () => {
    const { service, topicRepo } = makeService()

    const topic = await Effect.runPromise(
      service.createTopic({
        scopeId: 'project-1',
        slug: 'design-x',
        title: 'Design X',
        question: 'Which design?',
        initiatorAgentId: 'codex',
        participants: ['codex', 'claude'],
      })
    )

    expect(topic.status).toBe('active')
    expect(topic.lastSeq).toBe(0)
    expect(topicRepo.rows).toHaveLength(1)
  })

  it('appends turns with monotonically increasing seq and bumps topic.lastSeq', async () => {
    const { service, topicRepo, turnRepo } = makeService({ topics: [seedTopic()] })

    const first = await Effect.runPromise(
      service.addTurn({ scopeId: 'project-1', topicId: 'topic-1', agentId: 'codex', kind: 'statement', text: 'one' })
    )
    const second = await Effect.runPromise(
      service.addTurn({ scopeId: 'project-1', topicId: 'topic-1', agentId: 'claude', kind: 'statement', text: 'two' })
    )

    expect(first.seq).toBe(1)
    expect(second.seq).toBe(2)
    expect(topicRepo.rows[0].lastSeq).toBe(2)
    expect(turnRepo.rows).toHaveLength(2)
  })

  it('replays an idempotent turn without allocating a new seq', async () => {
    const { service, topicRepo, turnRepo } = makeService({ topics: [seedTopic()] })

    const first = await Effect.runPromise(
      service.addTurn({ scopeId: 'project-1', topicId: 'topic-1', agentId: 'codex', kind: 'statement', text: 'one', idempotencyKey: 'k1' })
    )
    const replay = await Effect.runPromise(
      service.addTurn({ scopeId: 'project-1', topicId: 'topic-1', agentId: 'codex', kind: 'statement', text: 'one', idempotencyKey: 'k1' })
    )

    expect(first.id).toBe(replay.id)
    expect(first.seq).toBe(1)
    expect(topicRepo.rows[0].lastSeq).toBe(1)
    expect(topicRepo.allocateNextSeq).toHaveBeenCalledTimes(1)
    expect(turnRepo.rows).toHaveLength(1)
  })

  it('rejects a stale expectedSeq with a conflict error', async () => {
    const { service, topicRepo, turnRepo } = makeService({ topics: [seedTopic()] })

    await expect(
      Effect.runPromise(
        service.addTurn({ scopeId: 'project-1', topicId: 'topic-1', agentId: 'codex', kind: 'statement', text: 'stale', expectedSeq: 5 })
      )
    ).rejects.toThrow(/discussion_expected_seq:topic-1:expected=5:actual=1/)

    expect(topicRepo.allocateNextSeq).not.toHaveBeenCalled()
    expect(turnRepo.rows).toHaveLength(0)
  })

  it('accepts a matching expectedSeq', async () => {
    const { service } = makeService({ topics: [seedTopic()] })

    const turn = await Effect.runPromise(
      service.addTurn({ scopeId: 'project-1', topicId: 'topic-1', agentId: 'codex', kind: 'statement', text: 'ok', expectedSeq: 1 })
    )

    expect(turn.seq).toBe(1)
  })

  it('enforces turn-order: the wrong next agent is rejected', async () => {
    const { service, topicRepo } = makeService({
      topics: [seedTopic({ rules: { turnOrder: ['codex', 'claude'] } })],
      turns: [{ id: 't1', scopeId: 'project-1', topicId: 'topic-1', seq: 1, agentId: 'codex', kind: 'statement', text: 'one' }],
    })
    topicRepo.rows[0].lastSeq = 1

    // expected next speaker is claude; codex speaking again must be rejected
    await expect(
      Effect.runPromise(
        service.addTurn({ scopeId: 'project-1', topicId: 'topic-1', agentId: 'codex', kind: 'statement', text: 'again' })
      )
    ).rejects.toThrow(/discussion_turn_order:topic-1:expected=claude:actual=codex/)

    // claude (the expected agent) is accepted
    const ok = await Effect.runPromise(
      service.addTurn({ scopeId: 'project-1', topicId: 'topic-1', agentId: 'claude', kind: 'statement', text: 'two' })
    )
    expect(ok.seq).toBe(2)
  })

  it('rejects turns on a non-active topic', async () => {
    const { service } = makeService({ topics: [seedTopic({ status: 'concluded', lastSeq: 7 })] })

    await expect(
      Effect.runPromise(
        service.addTurn({ scopeId: 'project-1', topicId: 'topic-1', agentId: 'codex', kind: 'statement', text: 'late' })
      )
    ).rejects.toThrow(/discussion_topic_not_active:topic-1:concluded/)
  })

  it('blocks on an operator question and clears the block ONLY on a correlated answer (replyToSeq === blockingTurnSeq)', async () => {
    const { service, topicRepo } = makeService({ topics: [seedTopic()] })

    const question = await Effect.runPromise(
      service.addTurn({ scopeId: 'project-1', topicId: 'topic-1', agentId: 'codex', kind: 'question', text: 'operator?', addressedTo: 'operator' })
    )
    expect(topicRepo.rows[0].blockedOn).toBe('operator')
    expect(topicRepo.rows[0].blockingTurnSeq).toBe(question.seq)

    // a normal agent turn is rejected while blocked
    await expect(
      Effect.runPromise(
        service.addTurn({ scopeId: 'project-1', topicId: 'topic-1', agentId: 'claude', kind: 'statement', text: 'cannot' })
      )
    ).rejects.toThrow(/discussion_blocked_on_operator:topic-1/)

    // an UNCORRELATED answer (no replyToSeq) must NOT clear the block — it is rejected while blocked
    await expect(
      Effect.runPromise(
        service.addTurn({ scopeId: 'project-1', topicId: 'topic-1', agentId: 'codex', kind: 'answer', text: 'unrelated answer' })
      )
    ).rejects.toThrow(/discussion_blocked_on_operator:topic-1/)
    expect(topicRepo.rows[0].blockedOn).toBe('operator')

    // an answer that replies to the blocking question (replyToSeq === blockingTurnSeq) clears the block
    const answer = await Effect.runPromise(
      service.addTurn({ scopeId: 'project-1', topicId: 'topic-1', agentId: 'codex', kind: 'answer', text: 'operator said go', replyToSeq: question.seq })
    )
    expect(answer.seq).toBe(2)
    expect(topicRepo.rows[0].blockedOn).toBeNull()
    expect(topicRepo.rows[0].blockingTurnSeq).toBeNull()
  })

  it('blocks conclude until minTurnsBeforeConclude is met', async () => {
    const { service } = makeService({
      topics: [seedTopic({ rules: { minTurnsBeforeConclude: 2 }, lastSeq: 1 })],
      turns: [
        { id: 't1', scopeId: 'project-1', topicId: 'topic-1', seq: 1, agentId: 'codex', kind: 'final-stance', text: 's' },
      ],
    })

    await expect(Effect.runPromise(service.conclude('topic-1'))).rejects.toThrow(/discussion_conclude_blocked:topic-1:min_turns_not_met:1\/2/)
  })

  it('blocks conclude until every participant has a final-stance, then concludes', async () => {
    const { service, topicRepo } = makeService({
      topics: [seedTopic({ lastSeq: 1 })],
      turns: [
        { id: 't1', scopeId: 'project-1', topicId: 'topic-1', seq: 1, agentId: 'codex', kind: 'final-stance', text: 'codex stance' },
      ],
    })

    await expect(Effect.runPromise(service.conclude('topic-1'))).rejects.toThrow(/discussion_conclude_blocked:topic-1:missing_final_stance:claude/)

    // claude provides a final-stance
    await Effect.runPromise(
      service.addTurn({ scopeId: 'project-1', topicId: 'topic-1', agentId: 'claude', kind: 'final-stance', text: 'claude stance' })
    )

    const concluded = await Effect.runPromise(service.conclude('topic-1', 'codex'))
    expect(concluded.status).toBe('concluded')
    expect(topicRepo.rows[0].status).toBe('concluded')
  })

  it('setOutput rejects _TBD_ content and non-participant owner, accepts a valid output (upsert per kind)', async () => {
    const { service, outputRepo } = makeService({ topics: [seedTopic()] })

    await expect(
      Effect.runPromise(
        service.setOutput({ scopeId: 'project-1', topicId: 'topic-1', outputKind: 'consensus', ownerAgentId: 'codex', content: 'has _TBD_ inside' })
      )
    ).rejects.toThrow(/discussion_output_tbd:topic-1:consensus/)

    await expect(
      Effect.runPromise(
        service.setOutput({ scopeId: 'project-1', topicId: 'topic-1', outputKind: 'consensus', ownerAgentId: 'stranger', content: 'final answer' })
      )
    ).rejects.toThrow(/discussion_output_owner_not_participant:topic-1:stranger/)

    const created = await Effect.runPromise(
      service.setOutput({ scopeId: 'project-1', topicId: 'topic-1', outputKind: 'consensus', ownerAgentId: 'codex', content: 'first' })
    )
    const updated = await Effect.runPromise(
      service.setOutput({ scopeId: 'project-1', topicId: 'topic-1', outputKind: 'consensus', ownerAgentId: 'claude', content: 'second' })
    )

    expect(created.id).toBe(updated.id)
    expect(outputRepo.rows).toHaveLength(1)
    expect(outputRepo.rows[0].content).toBe('second')
  })

  it('status computes nextSpeaker, canConclude, openQuestions and blockedOn deterministically', async () => {
    const { service } = makeService({
      topics: [seedTopic({ rules: { turnOrder: ['codex', 'claude'], minTurnsBeforeConclude: 2 }, lastSeq: 3 })],
      turns: [
        { id: 't1', scopeId: 'project-1', topicId: 'topic-1', seq: 1, agentId: 'codex', kind: 'question', text: 'open one?' },
        { id: 't2', scopeId: 'project-1', topicId: 'topic-1', seq: 2, agentId: 'claude', kind: 'final-stance', text: 'claude stance' },
        { id: 't3', scopeId: 'project-1', topicId: 'topic-1', seq: 3, agentId: 'codex', kind: 'final-stance', text: 'codex stance' },
      ],
    })

    const status = await Effect.runPromise(service.status('topic-1'))

    expect(status.status).toBe('active')
    expect(status.blockedOn).toBeNull()
    // last agent was codex -> next is claude
    expect(status.nextSpeaker).toBe('claude')
    // 3 turns >= minTurns 2 and both participants have a final-stance
    expect(status.canConclude).toBe(true)
    // the question at seq 1 was never answered (no kind=answer after it)
    expect(status.openQuestions.map((q) => q.seq)).toEqual([1])
  })

  it('openQuestions correlates answers to questions by replyToSeq, not arrival order', async () => {
    const { service } = makeService({
      topics: [seedTopic({ lastSeq: 3 })],
      turns: [
        { id: 't1', scopeId: 'project-1', topicId: 'topic-1', seq: 1, agentId: 'codex', kind: 'question', text: 'q1?' },
        { id: 't2', scopeId: 'project-1', topicId: 'topic-1', seq: 2, agentId: 'claude', kind: 'question', text: 'q2?' },
        // an answer that replies to q2 only — q1 must stay open despite a later answer existing
        { id: 't3', scopeId: 'project-1', topicId: 'topic-1', seq: 3, agentId: 'codex', kind: 'answer', text: 'a2', replyToSeq: 2 },
      ],
    })

    const status = await Effect.runPromise(service.status('topic-1'))
    // q1 (seq 1) stays open (no answer replies to it); q2 (seq 2) is closed by the replyToSeq=2 answer
    expect(status.openQuestions.map((q) => q.seq)).toEqual([1])
  })

  it('status reports canConclude false and the blocking reason when blocked on operator', async () => {
    const { service } = makeService({
      topics: [seedTopic({ blockedOn: 'operator', blockingTurnSeq: 1, lastSeq: 1 })],
      turns: [
        { id: 't1', scopeId: 'project-1', topicId: 'topic-1', seq: 1, agentId: 'codex', kind: 'question', text: 'op?', addressedTo: 'operator' },
      ],
    })

    const status = await Effect.runPromise(service.status('topic-1'))
    expect(status.blockedOn).toBe('operator')
    expect(status.canConclude).toBe(false)
    expect(status.reason).toMatch(/blocked_on_operator:turn=1/)
  })

  it('abandon sets status abandoned and records the reason', async () => {
    const { service, topicRepo } = makeService({ topics: [seedTopic({ lastSeq: 2 })] })

    const abandoned = await Effect.runPromise(service.abandon('topic-1', 'superseded by fork'))

    expect(abandoned.status).toBe('abandoned')
    expect(abandoned.abandonReason).toBe('superseded by fork')
    expect(topicRepo.rows[0].status).toBe('abandoned')
    expect(topicRepo.rows[0].abandonReason).toBe('superseded by fork')
  })

  it('abandon on a non-active topic is rejected', async () => {
    const { service } = makeService({ topics: [seedTopic({ status: 'concluded', lastSeq: 4 })] })

    await expect(Effect.runPromise(service.abandon('topic-1'))).rejects.toThrow(
      /discussion_abandon_blocked:topic-1:concluded/
    )
  })

  it('createTopic persists lineage fields and getTopic reads them back', async () => {
    const { service } = makeService()

    const created = await Effect.runPromise(
      service.createTopic({
        scopeId: 'project-1',
        slug: 'design-x-fork',
        title: 'Design X (fork)',
        question: 'Which design, revisited?',
        initiatorAgentId: 'codex',
        participants: ['codex', 'claude'],
        parentTopicId: 'topic-parent',
        lineageKind: 'fork',
        referencedOutputs: ['output-1', 'output-2'],
      })
    )

    expect(created.parentTopicId).toBe('topic-parent')
    expect(created.lineageKind).toBe('fork')
    expect(created.referencedOutputs).toEqual(['output-1', 'output-2'])

    const detail = await Effect.runPromise(service.getTopic(created.id as string))
    expect(detail.topic.parentTopicId).toBe('topic-parent')
    expect(detail.topic.lineageKind).toBe('fork')
    expect(detail.topic.referencedOutputs).toEqual(['output-1', 'output-2'])
  })

  it('listTopics filtered by parentTopicId returns only children of that parent', async () => {
    const { service } = makeService({
      topics: [
        seedTopic({ id: 'parent-1', slug: 'parent', parentTopicId: undefined }),
        seedTopic({ id: 'child-1', slug: 'child-a', parentTopicId: 'parent-1' }),
        seedTopic({ id: 'child-2', slug: 'child-b', parentTopicId: 'parent-1' }),
        seedTopic({ id: 'other-1', slug: 'other', parentTopicId: 'parent-2' }),
      ],
    })

    const children = await Effect.runPromise(service.listTopics({ parentTopicId: 'parent-1' }))

    expect(children.map((t) => t.id).sort()).toEqual(['child-1', 'child-2'])
  })
})
