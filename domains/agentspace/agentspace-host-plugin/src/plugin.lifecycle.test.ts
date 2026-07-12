import { describe, expect, it, vi } from 'vitest'

import { createAgentspacePlugin } from './plugin.js'
import type { DomainRequest, DomainRouteManifestEntry } from './types.js'

const HOST_STORAGE_ENV_KEYS = [
  'AOPS_REPO_URL',
  'AOPS_SQLITE_URL',
  'AOPS_PG_URL',
  'AGENTSPACE_REPO_URL',
  'AGENTSPACE_SQLITE_URL',
  'AGENTSPACE_PG_URL',
] as const

const CHAT_OPERATION_IDS = [
  'chat-room.create',
  'chat-room.get-by-id',
  'chat-room.list',
  'chat-room.update',
  'chat-room.archive',
  'chat-room.open-dm',
  'chat-room.export-manifest',
  'chat-member.add',
  'chat-member.update',
  'chat-member.remove',
  'chat-binding.add',
  'chat-binding.remove',
  'chat-message.send',
  'chat-message.list',
  'chat.catchup',
  'chat.mark-read',
] as const

function snapshotEnv(keys: readonly string[]): Record<string, string | undefined> {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]))
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

function findRouteByOperation(
  routes: DomainRouteManifestEntry[],
  operationId: string,
): DomainRouteManifestEntry {
  const route = routes.find((entry) => entry.operation === operationId)
  if (!route) throw new Error(`missing_test_route:${operationId}`)
  return route
}

function createDomainRequest(input: {
  method: DomainRequest['method']
  body?: unknown
  context?: DomainRequest['context']
}): DomainRequest {
  return {
    method: input.method,
    domain: 'agentspace',
    path: [],
    query: new URLSearchParams(),
    body: input.body ?? {},
    headers: new Headers(),
    url: new URL('http://localhost/api/aops'),
    context: input.context ?? {},
  }
}

describe('agentspace host-plugin lifecycle guards', () => {
  it('stores setup diagnostics in health details after successful setup', async () => {
    const plugin = createAgentspacePlugin({
      runner: vi.fn(async () => ({ ok: true })),
    })
    if (!plugin.setup) throw new Error('setup_hook_missing')

    await plugin.setup()
    const health = await plugin.health?.()

    expect(health).toBeDefined()
    expect(health?.details).toMatchObject({
      setupStatus: 'ready',
      setupAttempts: 1,
      setupLastError: null,
    })
    expect(typeof (health?.details as { setupReadyAt?: string }).setupReadyAt).toBe('string')
  })

  it('tracks setup failure when required runtime env is missing', async () => {
    const plugin = createAgentspacePlugin({
      requiredRuntimeEnv: ['AOPS_TEST_REQUIRED_ENV_KEY_MISSING'],
    })
    if (!plugin.setup) throw new Error('setup_hook_missing')

    await expect(plugin.setup()).rejects.toThrow(/runtime_env_missing:AOPS_TEST_REQUIRED_ENV_KEY_MISSING/)
    const health = await plugin.health?.()

    expect(health).toBeDefined()
    expect(health?.details).toMatchObject({
      setupStatus: 'failed',
      setupAttempts: 1,
      setupLastError: 'runtime_env_missing:AOPS_TEST_REQUIRED_ENV_KEY_MISSING',
    })
  })

  it('rejects SQLite repo override in integrated host setup', async () => {
    const envSnapshot = snapshotEnv(HOST_STORAGE_ENV_KEYS)
    process.env.AOPS_PG_URL = 'postgres://localhost/aops'
    delete process.env.AOPS_REPO_URL
    delete process.env.AOPS_SQLITE_URL
    delete process.env.AGENTSPACE_REPO_URL
    process.env.AGENTSPACE_SQLITE_URL = 'file:///tmp/agentspace.aops.sqlite'
    delete process.env.AGENTSPACE_PG_URL

    try {
      const plugin = createAgentspacePlugin()
      if (!plugin.setup) throw new Error('setup_hook_missing')

      await expect(plugin.setup()).rejects.toThrow(/agentspace_host_runtime_storage_unbound/)
      const health = await plugin.health?.()

      expect(health?.details).toMatchObject({
        setupStatus: 'failed',
        setupAttempts: 1,
        setupLastError: expect.stringContaining('agentspace_host_runtime_storage_unbound'),
      })
    } finally {
      restoreEnv(envSnapshot)
    }
  })

  it('injects project from request context when payload does not include project context', async () => {
    const runner = vi.fn(async () => ({ ok: true }))
    const plugin = createAgentspacePlugin({ runner })
    const route = findRouteByOperation(plugin.manifest.routes, 'project.delete-cascade')

    const response = await plugin.execute({
      request: createDomainRequest({
        method: route.method,
        body: { projectId: 'project-1' },
        context: { tenantId: 'tenant-1', projectId: 'project-1' },
      }),
      match: { route, params: {} },
    })

    expect(runner).toHaveBeenCalledTimes(1)
    expect(runner).toHaveBeenCalledWith(
      'project.delete-cascade',
      expect.objectContaining({
        projectId: 'project-1',
      }),
    )
    expect(response).toEqual({ ok: true })
  })

  it('defaults project create owner fields from request principal context', async () => {
    const runner = vi.fn(async () => ({ ok: true }))
    const plugin = createAgentspacePlugin({ runner })
    const route = findRouteByOperation(plugin.manifest.routes, 'project.create')

    const response = await plugin.execute({
      request: createDomainRequest({
        method: route.method,
        body: {
          data: {
            name: 'Owned project',
          },
        },
        context: {
          tenantId: 'tenant-1',
          principal: {
            userId: 'user-1',
          },
        },
      }),
      match: { route, params: {} },
    })

    expect(response).toEqual({ ok: true })
    expect(runner).toHaveBeenCalledTimes(1)
    expect(runner).toHaveBeenCalledWith(
      'project.create',
      expect.objectContaining({
        data: {
          name: 'Owned project',
          ownerId: 'user-1',
          createdBy: 'user-1',
          updatedBy: 'user-1',
        },
      }),
    )
  })

  it('preserves explicit project create owner fields with request principal context', async () => {
    const runner = vi.fn(async () => ({ ok: true }))
    const plugin = createAgentspacePlugin({ runner })
    const route = findRouteByOperation(plugin.manifest.routes, 'project.create')

    const response = await plugin.execute({
      request: createDomainRequest({
        method: route.method,
        body: {
          data: {
            name: 'Imported project',
            ownerId: 'owner-import',
            createdBy: 'creator-import',
            updatedBy: 'updater-import',
          },
        },
        context: {
          tenantId: 'tenant-1',
          principal: {
            userId: 'user-1',
          },
        },
      }),
      match: { route, params: {} },
    })

    expect(response).toEqual({ ok: true })
    expect(runner).toHaveBeenCalledTimes(1)
    expect(runner).toHaveBeenCalledWith(
      'project.create',
      expect.objectContaining({
        data: {
          name: 'Imported project',
          ownerId: 'owner-import',
          createdBy: 'creator-import',
          updatedBy: 'updater-import',
        },
      }),
    )
  })

  it('returns validation failure when payload project conflicts with request context project', async () => {
    const runner = vi.fn(async () => ({ ok: true }))
    const plugin = createAgentspacePlugin({ runner })
    const route = findRouteByOperation(plugin.manifest.routes, 'project.delete-cascade')

    const response = await plugin.execute({
      request: createDomainRequest({
        method: route.method,
        body: { projectId: 'project-2' },
        context: { tenantId: 'tenant-1', projectId: 'project-ctx-2' },
      }),
      match: { route, params: {} },
    })

    expect(runner).toHaveBeenCalledTimes(0)
    expect(response).toMatchObject({
      status: 400,
      data: {
        ok: false,
        errorCode: 'agentspace_operation_failed.invalid_input',
        operation: 'project.delete-cascade',
      },
    })
    expect((response as { data: { message: string } }).data.message).toContain(
      'validation_failed:project_context_mismatch',
    )
  })

  it('defaults scopeable GET list routes to exact scope from request context', async () => {
    const runner = vi.fn(async () => ({ ok: true }))
    const plugin = createAgentspacePlugin({ runner })
    const route = findRouteByOperation(plugin.manifest.routes, 'memory-item.list-memory-items')

    const response = await plugin.execute({
      request: createDomainRequest({
        method: route.method,
        context: {
          tenantId: 'tenant-1',
          projectId: 'project-1',
          scopeId: 'scope-project-1',
        },
      }),
      match: { route, params: {} },
    })

    expect(response).toEqual({ ok: true })
    expect(runner).toHaveBeenCalledTimes(1)
    expect(runner).toHaveBeenCalledWith(
      'memory-item.list-memory-items',
      expect.objectContaining({
        filter: {
          scopeId: 'scope-project-1',
          scopeResolution: 'explicit',
        },
      }),
    )
  })

  it('preserves explicit scope filters on scopeable GET list routes', async () => {
    const runner = vi.fn(async () => ({ ok: true }))
    const plugin = createAgentspacePlugin({ runner })
    const route = findRouteByOperation(plugin.manifest.routes, 'prompt.list-prompts')

    const response = await plugin.execute({
      request: createDomainRequest({
        method: route.method,
        body: {
          filter: {
            scopeId: 'shared-scope',
            scopeResolution: 'cascade',
          },
        },
        context: {
          tenantId: 'tenant-1',
          projectId: 'project-1',
          scopeId: 'scope-project-1',
        },
      }),
      match: { route, params: {} },
    })

    expect(response).toEqual({ ok: true })
    expect(runner).toHaveBeenCalledTimes(1)
    expect(runner).toHaveBeenCalledWith(
      'prompt.list-prompts',
      expect.objectContaining({
        filter: {
          scopeId: 'shared-scope',
          scopeResolution: 'cascade',
        },
      }),
    )
  })

  it('preserves explicit global filter intent on scopeable GET list routes', async () => {
    const runner = vi.fn(async () => ({ ok: true }))
    const plugin = createAgentspacePlugin({ runner })
    const route = findRouteByOperation(plugin.manifest.routes, 'resource.list-resources')

    const response = await plugin.execute({
      request: createDomainRequest({
        method: route.method,
        body: {
          filter: {
            global: true,
          },
        },
        context: {
          tenantId: 'tenant-1',
          projectId: 'project-1',
          scopeId: 'scope-project-1',
        },
      }),
      match: { route, params: {} },
    })

    expect(response).toEqual({ ok: true })
    expect(runner).toHaveBeenCalledTimes(1)
    expect(runner).toHaveBeenCalledWith(
      'resource.list-resources',
      expect.objectContaining({
        filter: {
          global: true,
        },
      }),
    )
  })

  it('keeps scopeable GET list routes valid without project context', async () => {
    const runner = vi.fn(async () => ({ ok: true }))
    const plugin = createAgentspacePlugin({ runner })
    const route = findRouteByOperation(plugin.manifest.routes, 'memory-item.list-memory-items')

    const response = await plugin.execute({
      request: createDomainRequest({
        method: route.method,
        context: {
          tenantId: 'tenant-1',
        },
      }),
      match: { route, params: {} },
    })

    expect(response).toEqual({ ok: true })
    expect(runner).toHaveBeenCalledTimes(1)
    expect(runner).toHaveBeenCalledWith('memory-item.list-memory-items', {})
  })

  it('uses explicit request scope resolution when defaulting scopeable GET list routes', async () => {
    const runner = vi.fn(async () => ({ ok: true }))
    const plugin = createAgentspacePlugin({ runner })
    const route = findRouteByOperation(plugin.manifest.routes, 'skill.list-skills')

    const response = await plugin.execute({
      request: createDomainRequest({
        method: route.method,
        context: {
          tenantId: 'tenant-1',
          projectId: 'project-1',
          scopeId: 'scope-project-1',
          scopeResolution: 'cascade',
        },
      }),
      match: { route, params: {} },
    })

    expect(response).toEqual({ ok: true })
    expect(runner).toHaveBeenCalledTimes(1)
    expect(runner).toHaveBeenCalledWith(
      'skill.list-skills',
      expect.objectContaining({
        filter: {
          scopeId: 'scope-project-1',
          scopeResolution: 'cascade',
        },
      }),
    )
  })

  it('returns service unavailable envelope when operation timeout is exceeded', async () => {
    const runner = vi.fn(async () => await new Promise<never>(() => {}))
    const plugin = createAgentspacePlugin({ runner, operationTimeoutMs: 100 })
    const route = findRouteByOperation(plugin.manifest.routes, 'project.delete-cascade')

    const startedAt = Date.now()
    const response = await plugin.execute({
      request: createDomainRequest({
        method: route.method,
        body: { projectId: 'project-3' },
        context: { tenantId: 'tenant-1' },
      }),
      match: { route, params: {} },
    })
    const elapsedMs = Date.now() - startedAt

    expect(elapsedMs).toBeGreaterThanOrEqual(90)
    expect(response).toMatchObject({
      status: 503,
      data: {
        ok: false,
        errorCode: 'agentspace_operation_failed.service_unavailable',
        operation: 'project.delete-cascade',
      },
    })
  })

  it('returns a not_found envelope for foreign-key reference failures', async () => {
    const runner = vi.fn(async () => {
      throw new Error(
        'insert into "memory_items" violates foreign key constraint "memory_items_projectId_projects_id_fk"',
      )
    })
    const plugin = createAgentspacePlugin({ runner })
    const route = findRouteByOperation(plugin.manifest.routes, 'memory-item.add-memory-item')

    const response = await plugin.execute({
      request: createDomainRequest({
        method: route.method,
        body: {
          data: {
            scopeId: 'project-5',
            kind: 'kickoff',
            durability: 'short',
            content: 'probe',
          },
        },
        context: { tenantId: 'tenant-1' },
      }),
      match: { route, params: {} },
    })

    expect(response).toMatchObject({
      status: 404,
      data: {
        ok: false,
        errorCode: 'agentspace_operation_failed.invalid_reference',
        operation: 'memory-item.add-memory-item',
        message: 'Referenced project or owner scope record was not found for the supplied ids.',
      },
    })
  })

  it('returns runtime_env_missing envelope for default runner when required env is absent', async () => {
    const plugin = createAgentspacePlugin({
      requiredRuntimeEnv: ['AOPS_TEST_REQUIRED_ENV_KEY_MISSING'],
    })
    const route = findRouteByOperation(plugin.manifest.routes, 'project.delete-cascade')

    const response = await plugin.execute({
      request: createDomainRequest({
        method: route.method,
        body: { projectId: 'project-4' },
        context: { tenantId: 'tenant-1' },
      }),
      match: { route, params: {} },
    })

    expect(response).toMatchObject({
      status: 503,
      data: {
        ok: false,
        errorCode: 'agentspace_operation_failed.runtime_env_missing',
        operation: 'project.delete-cascade',
      },
    })
    expect((response as { data: { message: string } }).data.message).toContain(
      'runtime_env_missing:AOPS_TEST_REQUIRED_ENV_KEY_MISSING',
    )
  })

  it('normalizes codex-chat message create input when messageAt is omitted', async () => {
    const runner = vi.fn(async () => ({ ok: true }))
    const plugin = createAgentspacePlugin({ runner })
    const route = findRouteByOperation(plugin.manifest.routes, 'codex-chat-message.create')

    const response = await plugin.execute({
      request: createDomainRequest({
        method: route.method,
        body: {
          data: {
            projectId: 'project-1',
            threadId: 'thread-1',
            role: 'user',
            text: 'hello',
            seq: 1,
          },
        },
        context: { tenantId: 'tenant-1', projectId: 'project-1' },
      }),
      match: { route, params: {} },
    })

    expect(response).toEqual({ ok: true })
    expect(runner).toHaveBeenCalledTimes(1)
    const payload = runner.mock.calls[0][1] as { data?: Record<string, unknown> }
    expect(typeof payload.data?.messageAt).toBe('string')
    expect(String(payload.data?.messageAt)).toMatch(/\d{4}-\d{2}-\d{2}T/)
  })

  it('normalizes legacy top-level codex-chat list payload into filter/options', async () => {
    const runner = vi.fn(async () => ({ ok: true }))
    const plugin = createAgentspacePlugin({ runner })
    const route = findRouteByOperation(plugin.manifest.routes, 'codex-chat-message.list-messages')

    const response = await plugin.execute({
      request: createDomainRequest({
        method: route.method,
        body: {
          externalThreadId: 'thread-ext-1',
          role: 'user',
          limit: 25,
        },
        context: { tenantId: 'tenant-1', projectId: 'project-1' },
      }),
      match: { route, params: {} },
    })

    expect(response).toEqual({ ok: true })
    expect(runner).toHaveBeenCalledTimes(1)
    const payload = runner.mock.calls[0][1] as { filter?: Record<string, unknown>; options?: Record<string, unknown> }
    expect(payload.filter).toMatchObject({
      projectId: 'project-1',
      externalThreadId: 'thread-ext-1',
      role: 'user',
    })
    expect(payload.options).toMatchObject({
      limit: 25,
    })
  })

  it('projects chat routes with cleaned input schemas', () => {
    const plugin = createAgentspacePlugin({ runner: vi.fn(async () => ({ ok: true })) })
    const projected = new Set(plugin.manifest.routes.map((route) => route.operation))

    for (const operationId of CHAT_OPERATION_IDS) {
      expect(projected.has(operationId)).toBe(true)
    }

    const sendRoute = findRouteByOperation(plugin.manifest.routes, 'chat-message.send')
    const sendData = (sendRoute.inputJsonSchema as any)?.properties?.data?.properties ?? {}
    expect(sendRoute).toMatchObject({ method: 'POST', pattern: '/chat-messages' })
    expect(sendData.updatedBy).toBeUndefined()

    const createRoute = findRouteByOperation(plugin.manifest.routes, 'chat-room.create')
    const createData = (createRoute.inputJsonSchema as any)?.properties?.data?.properties ?? {}
    expect(createRoute).toMatchObject({ method: 'POST', pattern: '/chat-rooms' })
    expect(createData.lastMessageAt).toBeUndefined()
    expect(createData.lastSeq).toBeUndefined()

    const memberRoute = findRouteByOperation(plugin.manifest.routes, 'chat-member.add')
    const memberData = (memberRoute.inputJsonSchema as any)?.properties?.data?.properties ?? {}
    expect(memberData.joinedAt).toBeUndefined()
    expect(memberData.leftAt).toBeUndefined()
  })

  it('strictly validates chat inputs before runner dispatch', async () => {
    const runner = vi.fn(async () => ({ ok: true }))
    const plugin = createAgentspacePlugin({ runner })
    const route = findRouteByOperation(plugin.manifest.routes, 'chat-message.send')

    const response = await plugin.execute({
      request: createDomainRequest({
        method: route.method,
        body: {
          data: {
            scopeId: 'project-1',
            roomId: 'room-1',
            authorAgentId: 'codex',
            text: 'hello',
            updatedBy: 'operator',
          },
        },
        context: { tenantId: 'tenant-1', projectId: 'project-1' },
      }),
      match: { route, params: {} },
    })

    expect(runner).toHaveBeenCalledTimes(0)
    expect(response).toMatchObject({
      status: 400,
      data: {
        ok: false,
        errorCode: 'agentspace_operation_failed.invalid_input',
        operation: 'chat-message.send',
      },
    })
    expect((response as { data: { message: string } }).data.message).toContain(
      'tool_input_schema_invalid:agentspace.chat-message.send',
    )
  })

  it('passes cleaned chat inputs to the runner', async () => {
    const runner = vi.fn(async () => ({ ok: true }))
    const plugin = createAgentspacePlugin({ runner })
    const route = findRouteByOperation(plugin.manifest.routes, 'chat-message.send')

    const response = await plugin.execute({
      request: createDomainRequest({
        method: route.method,
        body: {
          data: {
            scopeId: 'project-1',
            roomId: 'room-1',
            authorAgentId: 'codex',
            text: 'hello',
          },
        },
        context: { tenantId: 'tenant-1', projectId: 'project-1' },
      }),
      match: { route, params: {} },
    })

    expect(response).toEqual({ ok: true })
    expect(runner).toHaveBeenCalledTimes(1)
    expect(runner).toHaveBeenCalledWith(
      'chat-message.send',
      expect.objectContaining({
        data: expect.objectContaining({
          scopeId: 'project-1',
          roomId: 'room-1',
          authorAgentId: 'codex',
          text: 'hello',
        }),
      }),
    )
  })

  it('sanitizes unsafe chat runtime failures', async () => {
    const runner = vi.fn(async () => {
      throw new Error('failed query: insert into "chat_messages" values ($1) params: [secret]')
    })
    const plugin = createAgentspacePlugin({ runner })
    const route = findRouteByOperation(plugin.manifest.routes, 'chat-message.send')

    const response = await plugin.execute({
      request: createDomainRequest({
        method: route.method,
        body: {
          data: {
            scopeId: 'project-1',
            roomId: 'room-1',
            authorAgentId: 'codex',
            text: 'hello',
          },
        },
        context: { tenantId: 'tenant-1', projectId: 'project-1' },
      }),
      match: { route, params: {} },
    })

    expect(response).toMatchObject({
      status: 503,
      data: {
        ok: false,
        errorCode: 'agentspace_operation_failed.service_unavailable',
        operation: 'chat-message.send',
        message: 'Runtime operation failed. Check server logs for details.',
      },
    })
  })

  it('maps archived chat room sends to conflict instead of runtime failure', async () => {
    const runner = vi.fn(async () => {
      throw new Error('agentspace.conflict:chat_room_archived:room-1')
    })
    const plugin = createAgentspacePlugin({ runner })
    const route = findRouteByOperation(plugin.manifest.routes, 'chat-message.send')

    const response = await plugin.execute({
      request: createDomainRequest({
        method: route.method,
        body: {
          data: {
            scopeId: 'project-1',
            roomId: 'room-1',
            authorAgentId: 'codex',
            text: 'hello',
          },
        },
        context: { tenantId: 'tenant-1', projectId: 'project-1' },
      }),
      match: { route, params: {} },
    })

    expect(response).toMatchObject({
      status: 409,
      data: {
        ok: false,
        errorCode: 'agentspace_operation_failed.conflict',
        operation: 'chat-message.send',
        message: 'agentspace.conflict:chat_room_archived:room-1',
      },
    })
  })

  it('does not inject removed legacy scope aliases into scope-owned create payloads', async () => {
    const runner = vi.fn(async () => ({ ok: true }))
    const plugin = createAgentspacePlugin({ runner })
    const route = findRouteByOperation(plugin.manifest.routes, 'prompt.create')

    const response = await plugin.execute({
      request: createDomainRequest({
        method: route.method,
        body: {
          data: {
            scopeId: 'project-scope-1',
            name: 'Resume Prompt',
            status: 'draft',
          },
        },
        context: { tenantId: 'tenant-1', projectId: 'project-scope-1' },
      }),
      match: { route, params: {} },
    })

    expect(response).toEqual({ ok: true })
    expect(runner).toHaveBeenCalledTimes(1)
    expect(runner).toHaveBeenCalledWith(
      'prompt.create',
      expect.objectContaining({
        data: expect.objectContaining({
          scopeId: 'project-scope-1',
          name: 'Resume Prompt',
        }),
      }),
    )
    const payload = runner.mock.calls[0][1] as { data?: Record<string, unknown> }
    expect(payload.data?.scopeId).toBe('project-scope-1')
    expect(payload.data?.projectId).toBeUndefined()
  })

  it('reports runtime env readiness in health details', async () => {
    const plugin = createAgentspacePlugin({
      requiredRuntimeEnv: ['AOPS_TEST_REQUIRED_ENV_KEY_MISSING'],
    })

    const health = await plugin.health?.()
    expect(health).toBeDefined()
    expect(health?.ok).toBe(false)
    expect(health?.details).toMatchObject({
      requiredRuntimeEnv: ['AOPS_TEST_REQUIRED_ENV_KEY_MISSING'],
      missingRuntimeEnv: ['AOPS_TEST_REQUIRED_ENV_KEY_MISSING'],
    })
  })

  it('validates plugin options with plugin_contract_invalid token', async () => {
    expect(() =>
      createAgentspacePlugin({
        operationTimeoutMs: Number.NaN,
      }),
    ).toThrowError(/plugin_contract_invalid:operationTimeoutMs/)
  })
})
