import { describe, it, expect, vi } from 'vitest'
import { Effect } from 'effect'
import { AgentProfileService } from '../service.agentProfile.js'

const makeRepo = () => ({
  create: vi.fn(),
  findById: vi.fn(),
  patchById: vi.fn(),
  find: vi.fn(),
  deleteById: vi.fn(),
})

describe('AgentProfileService', () => {
  it('creates a profile, defaulting kind and deriving slug from name', async () => {
    const repo = makeRepo()
    repo.create.mockImplementation((data) => Effect.succeed({ ...data, id: 'profile-1' }))

    const service = new AgentProfileService({ agentProfileRepository: repo as any })

    const created = await Effect.runPromise(
      service.createProfile({
        scopeId: 'scope-project-1',
        name: 'Backend Implementer',
        role: 'implementer',
      } as any),
    )

    expect(repo.create).toHaveBeenCalledTimes(1)
    const payload = repo.create.mock.calls[0][0]
    expect(payload.kind).toBe('role-profile')
    expect(payload.slug).toBe('backend-implementer')
    expect(payload.role).toBe('implementer')
    expect(created.id).toBe('profile-1')
  })

  it('preserves an explicit slug and kind on create', async () => {
    const repo = makeRepo()
    repo.create.mockImplementation((data) => Effect.succeed({ ...data, id: 'profile-2' }))

    const service = new AgentProfileService({ agentProfileRepository: repo as any })

    await Effect.runPromise(
      service.createProfile({
        scopeId: 'scope-project-1',
        name: 'Reviewer',
        role: 'reviewer',
        slug: 'custom-reviewer',
        kind: 'reviewer-profile',
      } as any),
    )

    const payload = repo.create.mock.calls[0][0]
    expect(payload.slug).toBe('custom-reviewer')
    expect(payload.kind).toBe('reviewer-profile')
  })

  it('fails create when name or role is missing', async () => {
    const repo = makeRepo()
    const service = new AgentProfileService({ agentProfileRepository: repo as any })

    await expect(
      Effect.runPromise(service.createProfile({ scopeId: 'scope-project-1', role: 'implementer' } as any)),
    ).rejects.toBeTruthy()
    await expect(
      Effect.runPromise(service.createProfile({ scopeId: 'scope-project-1', name: 'No Role' } as any)),
    ).rejects.toBeTruthy()
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('gets a profile by id', async () => {
    const repo = makeRepo()
    repo.findById.mockImplementation((id) => Effect.succeed({ id, name: 'Backend Implementer' }))

    const service = new AgentProfileService({ agentProfileRepository: repo as any })
    const result = await Effect.runPromise(service.getProfileById('profile-1'))

    expect(repo.findById).toHaveBeenCalledWith('profile-1', undefined)
    expect(result?.name).toBe('Backend Implementer')
  })

  it('lists profiles filtered by role via matchEq', async () => {
    const repo = makeRepo()
    repo.find.mockImplementation(() => Effect.succeed([{ id: 'profile-1', slug: 'a', role: 'implementer' }]))

    const service = new AgentProfileService({ agentProfileRepository: repo as any })
    const listed = await Effect.runPromise(
      service.listProfiles({ scopeId: 'scope-project-1', role: 'implementer', scopeResolution: 'explicit' }),
    )

    expect(repo.find).toHaveBeenCalledWith({
      matchEq: { scopeId: 'scope-project-1', role: 'implementer' },
      options: undefined,
    })
    expect(listed.map((p) => p.id)).toEqual(['profile-1'])
  })

  it('lists profiles filtered by defaultAgent without leaking it into matchEq', async () => {
    const repo = makeRepo()
    repo.find.mockImplementation(() =>
      Effect.succeed([
        { id: 'profile-1', slug: 'a', role: 'implementer', defaultAgents: ['codex', 'claude'] },
        { id: 'profile-2', slug: 'b', role: 'reviewer', defaultAgents: ['claude'] },
        { id: 'profile-3', slug: 'c', role: 'tester', defaultAgents: [] },
      ]),
    )

    const service = new AgentProfileService({ agentProfileRepository: repo as any })
    const listed = await Effect.runPromise(
      service.listProfiles({ scopeId: 'scope-project-1', defaultAgent: 'codex', scopeResolution: 'explicit' }),
    )

    // defaultAgent must NOT be passed to the repository matchEq (it is a jsonb array).
    expect(repo.find).toHaveBeenCalledWith({
      matchEq: { scopeId: 'scope-project-1' },
      options: undefined,
    })
    expect(listed.map((p) => p.id)).toEqual(['profile-1'])
  })

  it('updates a profile patch', async () => {
    const repo = makeRepo()
    repo.patchById.mockImplementation((id, patch) => Effect.succeed({ id, ...patch }))

    const service = new AgentProfileService({ agentProfileRepository: repo as any })
    const result = await Effect.runPromise(service.updateProfile('profile-1', { name: 'Renamed' }))

    expect(repo.patchById).toHaveBeenCalledWith('profile-1', { name: 'Renamed' })
    expect(result.name).toBe('Renamed')
  })

  it('deletes a profile', async () => {
    const repo = makeRepo()
    repo.deleteById.mockImplementation(() => Effect.succeed(undefined))

    const service = new AgentProfileService({ agentProfileRepository: repo as any })
    await Effect.runPromise(service.deleteProfile('profile-1'))

    expect(repo.deleteById).toHaveBeenCalledWith('profile-1')
  })
})
