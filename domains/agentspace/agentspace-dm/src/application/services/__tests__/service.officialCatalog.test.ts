import { createHash } from 'node:crypto'

import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import { OfficialCatalogService } from '../service.officialCatalog.js'
import {
  OFFICIAL_CATALOG_SCOPE_SLUG,
  type OfficialCatalogPackageV1,
  type OfficialCatalogReconcilePlanV1,
  type OfficialCatalogScopeV1,
} from '../../ports/inbound/IOfficialCatalogServicePort.js'

const OFFICIAL_SCOPE: OfficialCatalogScopeV1 = {
  schemaVersion: 1,
  slug: OFFICIAL_CATALOG_SCOPE_SLUG,
  kind: 'agentspace-skill-catalog',
  owner: 'aops-community-setup',
  reserved: true,
}
const RELEASE_SET = 'a'.repeat(64)

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function packageDigest(files: Array<{ path: string; sha256: string }>): string {
  return sha256(Buffer.concat(files
    .sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)))
    .map((file) => Buffer.from(`${file.path}\0${file.sha256}\n`))))
}

function packageInput(name: string, versionId: string, body: string): OfficialCatalogPackageV1 {
  const fileSha256 = sha256(body)
  const packageSha256 = packageDigest([{ path: 'SKILL.md', sha256: fileSha256 }])
  const manifest = {
    schemaVersion: 1 as const,
    assetKind: 'skill-package' as const,
    name,
    version: versionId,
    versionId,
    entryFile: 'SKILL.md' as const,
    standard: 'aops-skill-package-v1' as const,
    packageSha256,
    files: [{ path: 'SKILL.md', sha256: fileSha256, byteLength: Buffer.byteLength(body) }],
    compatibility: { minCliVersion: '0.1.0', maxSchemaVersion: 1 as const },
    provenance: {
      trustClass: 'verified-hosted-package' as const,
      expectedDigestSource: 'immutable-hosted-metadata' as const,
      reference: `agentspace:skill-version/${versionId}`,
    },
  }
  const manifestSha256 = sha256(JSON.stringify(manifest))
  return {
    name,
    version: versionId,
    versionId,
    packageSha256,
    manifestSha256,
    entryFile: 'SKILL.md',
    manifest,
    files: [{ path: 'SKILL.md', sha256: fileSha256, byteLength: Buffer.byteLength(body), content: body }],
    meta: {
      aopsOfficialCatalog: {
        schemaVersion: 1,
        scopeSlug: OFFICIAL_CATALOG_SCOPE_SLUG,
        source: 'signed-community-release',
        releaseSetSha256: RELEASE_SET,
        manifestSha256,
        packageSha256,
        inert: true,
      },
    },
  }
}

function plan(options: {
  packageInput: OfficialCatalogPackageV1
  revision?: number
  previousReceiptId?: string | null
  currentMap?: Record<string, string | null>
  existingRecordId?: string | null
  idempotencyKey: string
}): OfficialCatalogReconcilePlanV1 {
  const current = options.currentMap ?? {}
  const action = options.existingRecordId
    ? current[options.packageInput.name] === options.existingRecordId ? 'unchanged' : 'set-current'
    : 'append-version'
  return {
    schemaVersion: 1,
    kind: 'aops-official-catalog-reconcile-plan-v1',
    scope: OFFICIAL_SCOPE,
    releaseSetSha256: RELEASE_SET,
    expectedCatalogRevision: options.revision ?? 0,
    expectedPreviousReceiptId: options.previousReceiptId ?? null,
    expectedCurrentVersionMap: current,
    desiredPackageVersionMap: { [options.packageInput.name]: options.packageInput.versionId },
    packages: [options.packageInput],
    actions: [{
      name: options.packageInput.name,
      action,
      versionId: options.packageInput.versionId,
      packageSha256: options.packageInput.packageSha256,
      existingRecordId: options.existingRecordId ?? null,
    }],
    mutationRequired: action !== 'unchanged',
    activationEffects: [],
    historyDeleteCount: 0,
    idempotencyKey: options.idempotencyKey,
  }
}

class MemoryRepository {
  rows: any[] = []
  deleteCalls = 0
  contextDepth = 0

  setCtx(): void { this.contextDepth += 1 }
  clearCtx(): void { this.contextDepth -= 1 }

  create(data: any) {
    return Effect.sync(() => {
      const row = { ...structuredClone(data), id: data.id ?? `id-${this.rows.length + 1}` }
      this.rows.push(row)
      return structuredClone(row)
    })
  }

  createPreservingId(data: any) { return this.create(data) }

  findById(id: string) {
    return Effect.sync(() => structuredClone(this.rows.find((row) => row.id === id) ?? null))
  }

  find(params: any) {
    return Effect.sync(() => {
      const match = params.matchEq ?? {}
      const rows = this.rows.filter((row) => Object.entries(match).every(([key, value]) => row[key] === value))
      return structuredClone(rows.slice(0, params.options?.limit ?? rows.length))
    })
  }

  findSingle(params: any) {
    return this.find(params).pipe(Effect.map((rows) => rows[0] ?? null))
  }

  patchById(id: string, patch: any) {
    return Effect.sync(() => {
      const index = this.rows.findIndex((row) => row.id === id)
      if (index < 0) throw new Error(`missing:${id}`)
      this.rows[index] = { ...this.rows[index], ...structuredClone(patch) }
      return structuredClone(this.rows[index])
    })
  }

  deleteById() { this.deleteCalls += 1; return Effect.succeed(1) }
  deleteByIdWithMatch() { this.deleteCalls += 1; return Effect.succeed(1) }
  deleteMany() { this.deleteCalls += 1; return Effect.succeed(1) }
  cleanupAll() { this.deleteCalls += 1; return Effect.succeed(1) }
  insertMany(values: any[]) { return Effect.all(values.map((value) => this.create(value))) }
  updateById(id: string, value: any) { return this.patchById(id, value) }
  upsert(value: any) { return this.create(value) }
}

function fixture(withUnitOfWork = true) {
  const repositories = {
    projectRepository: new MemoryRepository(),
    scopeRepository: new MemoryRepository(),
    resourceRepository: new MemoryRepository(),
    skillRepository: new MemoryRepository(),
    skillVersionRepository: new MemoryRepository(),
  }
  const all = Object.values(repositories)
  const unitOfWork = withUnitOfWork ? {
    runInTransaction<T, E>(fn: (ctx: any) => Effect.Effect<T, E>) {
      return Effect.tryPromise({
        try: async () => {
          const before = all.map((repository) => structuredClone(repository.rows))
          try {
            return await Effect.runPromise(fn({ drizzleTx: { test: true } }))
          } catch (error) {
            all.forEach((repository, index) => { repository.rows = before[index]! })
            throw error
          }
        },
        catch: (error) => error as E,
      })
    },
  } : undefined
  const service = new OfficialCatalogService({ ...(repositories as any), unitOfWork: unitOfWork as any })
  return { service, repositories }
}

describe('OfficialCatalogService', () => {
  it('creates one reserved inert graph, a CAS state, and an append-only receipt atomically', async () => {
    const { service, repositories } = fixture()
    expect((await Effect.runPromise(service.inspect(OFFICIAL_SCOPE))).state).toBe('absent')

    const input = packageInput('aops-working-disciplines', 'release-v1', '# v1\n')
    const receipt = await Effect.runPromise(service.reconcile(plan({ packageInput: input, idempotencyKey: 'install-v1' })))
    const snapshot = await Effect.runPromise(service.inspect(OFFICIAL_SCOPE))

    expect(receipt.catalogRevision).toBe(1)
    expect(receipt.historyDeleteCount).toBe(0)
    expect(receipt.activationEffects).toEqual([])
    expect(snapshot.state).toBe('ready')
    expect(snapshot.versions).toHaveLength(1)
    expect(snapshot.currentVersionMap['aops-working-disciplines']).toBe(snapshot.versions[0]?.recordId)
    expect(repositories.projectRepository.rows).toHaveLength(1)
    expect(repositories.scopeRepository.rows).toHaveLength(1)
    expect(repositories.skillRepository.rows).toHaveLength(1)
    expect(repositories.skillVersionRepository.rows).toHaveLength(1)
    expect(repositories.resourceRepository.rows).toHaveLength(2)
    expect(repositories.skillVersionRepository.rows[0]?.meta?.aopsOfficialCatalog?.inert).toBe(true)
    expect(repositories.skillVersionRepository.rows[0]?.meta?.packageManifestV1?.versionId).toBe(snapshot.versions[0]?.recordId)
    expect(Object.values(repositories).every((repository) => repository.deleteCalls === 0)).toBe(true)
    expect(Object.values(repositories).every((repository) => repository.contextDepth === 0)).toBe(true)
  })

  it('returns the same durable receipt for an idempotent retry without appending history', async () => {
    const { service, repositories } = fixture()
    const input = packageInput('aops', 'release-v1', '# AOPS\n')
    const request = plan({ packageInput: input, idempotencyKey: 'same-install' })
    const first = await Effect.runPromise(service.reconcile(request))
    const second = await Effect.runPromise(service.reconcile(request))
    expect(second).toEqual(first)
    expect(repositories.skillVersionRepository.rows).toHaveLength(1)
    expect(repositories.resourceRepository.rows).toHaveLength(2)
  })

  it('binds idempotency to the exact request and detects persisted package tampering', async () => {
    const { service, repositories } = fixture()
    const input = packageInput('aops', 'release-v1', '# AOPS\n')
    await Effect.runPromise(service.reconcile(plan({ packageInput: input, idempotencyKey: 'bound-key' })))
    const other = packageInput('aops', 'release-v2', '# changed\n')
    await expect(Effect.runPromise(service.reconcile(plan({
      packageInput: other,
      idempotencyKey: 'bound-key',
    })))).rejects.toThrow('idempotency_conflict')

    repositories.skillVersionRepository.rows[0].files[0].content = '# database tamper\n'
    await expect(Effect.runPromise(service.inspect(OFFICIAL_SCOPE))).rejects.toThrow('version_file_digest_mismatch')
  })

  it('rolls back to the selected receipt prior map without deleting appended versions or receipts', async () => {
    const { service, repositories } = fixture()
    const v1 = packageInput('aops', 'release-v1', '# one\n')
    const first = await Effect.runPromise(service.reconcile(plan({ packageInput: v1, idempotencyKey: 'v1' })))
    const firstSnapshot = await Effect.runPromise(service.inspect(OFFICIAL_SCOPE))
    const v2 = packageInput('aops', 'release-v2', '# two\n')
    const second = await Effect.runPromise(service.reconcile(plan({
      packageInput: v2,
      revision: firstSnapshot.catalogRevision,
      previousReceiptId: firstSnapshot.lastReceiptId,
      currentMap: firstSnapshot.currentVersionMap,
      idempotencyKey: 'v2',
    })))
    const rolledBack = await Effect.runPromise(service.rollback({
      schemaVersion: 1,
      kind: 'aops-official-catalog-rollback-request-v1',
      scope: OFFICIAL_SCOPE,
      receiptId: second.receiptId,
      expectedCatalogRevision: second.catalogRevision,
      idempotencyKey: 'rollback-v2',
      deleteHistory: false,
      activationEffects: [],
    }))
    const snapshot = await Effect.runPromise(service.inspect(OFFICIAL_SCOPE))

    expect(rolledBack.currentVersionMap).toEqual(first.currentVersionMap)
    expect(snapshot.currentVersionMap).toEqual(first.currentVersionMap)
    expect(snapshot.versions).toHaveLength(2)
    expect(repositories.resourceRepository.rows.filter((row) => row.refType === 'aops-official-catalog-receipt-v1')).toHaveLength(3)
    expect(Object.values(repositories).every((repository) => repository.deleteCalls === 0)).toBe(true)
  })

  it('rejects tampered file bytes and rolls the fresh reserved scope back to absent', async () => {
    const { service, repositories } = fixture()
    const input = packageInput('aops', 'release-v1', '# signed\n')
    input.files[0]!.content = '# tampered\n'
    await expect(Effect.runPromise(service.reconcile(plan({ packageInput: input, idempotencyKey: 'tampered' })))).rejects.toThrow('package_file_digest_mismatch')
    expect((await Effect.runPromise(service.inspect(OFFICIAL_SCOPE))).state).toBe('absent')
    expect(Object.values(repositories).every((repository) => repository.rows.length === 0)).toBe(true)
  })

  it('fails closed on stale CAS state and when no transactional store is available', async () => {
    const ready = fixture()
    const input = packageInput('aops', 'release-v1', '# v1\n')
    await expect(Effect.runPromise(ready.service.reconcile(plan({
      packageInput: input,
      revision: 9,
      idempotencyKey: 'stale',
    })))).rejects.toThrow('compare_and_swap_conflict')

    const unavailable = fixture(false)
    await expect(Effect.runPromise(unavailable.service.reconcile(plan({
      packageInput: input,
      idempotencyKey: 'no-uow',
    })))).rejects.toThrow('atomic_store_required')
  })
})
