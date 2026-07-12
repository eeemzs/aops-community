import { afterEach, describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { drizzleSqliteDisconnect } from '@aopslab/xf-db-drizzle'

import { inferDrizzleDialectFromRepositoryConfig } from '../application/factories/drizzleDialect.js'
import { WorkflowDefinitionDrizzleSqliteRepo } from '../infrastructure/repositories/workflowDefinition/drizzle/WorkflowDefinitionDrizzleSqliteRepo.js'

const tempDirs: string[] = []

afterEach(async () => {
  await drizzleSqliteDisconnect()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (!dir) continue
    rmSync(dir, { recursive: true, force: true })
  }
})

function createWorkflowDefinitionSqliteFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'agentspace-workflow-definition-'))
  tempDirs.push(dir)
  const dbPath = join(dir, 'agentspace.sqlite')
  const db = new DatabaseSync(dbPath)

  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE scopes (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      scopeType TEXT NOT NULL,
      ownerType TEXT NOT NULL
    );
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      scopeId TEXT NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
      name TEXT NOT NULL
    );
    CREATE TABLE "workflow-definitions" (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      scopeId TEXT NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
      definitionId TEXT NOT NULL,
      name TEXT NOT NULL,
      mode TEXT NOT NULL,
      subjectType TEXT,
      runtimeProfile TEXT,
      steps TEXT NOT NULL,
      policies TEXT,
      meta TEXT,
      createdAt INTEGER,
      updatedAt INTEGER
    );
    CREATE UNIQUE INDEX workflow_definition_unique_definition_id
      ON "workflow-definitions" (tenantId, scopeId, definitionId);
    INSERT INTO scopes (id, tenantId, scopeType, ownerType)
      VALUES ('project-1', 'tenant-1', 'project', 'project');
    INSERT INTO projects (id, tenantId, scopeId, name)
      VALUES ('project-1', 'tenant-1', 'project-1', 'Test Project');
  `)
  db.close()

  return {
    dbPath,
    repo: new WorkflowDefinitionDrizzleSqliteRepo({
      repositoryConfig: {
        repositoryType: 'drizzle',
        drizzleDialect: 'sqlite',
        tenantId: 'tenant-1',
        scopeId: 'project-1',
        url: `file:${dbPath}`,
      },
    }),
  }
}

describe('workflowDefinition repository dialect support', () => {
  it('infers postgres and sqlite repository dialects from config', () => {
    expect(
      inferDrizzleDialectFromRepositoryConfig({ url: 'postgresql://user:pass@localhost:5432/aops' })
    ).toBe('pg')
    expect(
      inferDrizzleDialectFromRepositoryConfig({ url: 'file:/tmp/agentspace.sqlite' })
    ).toBe('sqlite')
    expect(
      inferDrizzleDialectFromRepositoryConfig({ drizzleDialect: 'sqlite', url: 'postgresql://ignored' })
    ).toBe('sqlite')
  })

  it('creates workflow definitions through the sqlite repository owner chain', async () => {
    const { repo } = createWorkflowDefinitionSqliteFixture()

    const created = await Effect.runPromise(
      repo.create({
        scopeId: 'project-1',
        definitionId: 'wf-sqlite-template',
        name: 'SQLite Template Workflow',
        mode: 'template',
        subjectType: 'projectman.issue',
        runtimeProfile: 'ops-triage',
        steps: [{ stepId: 'triage-customer-message', kind: 'run-turn' }],
        policies: null,
        meta: { source: 'dialect-test' },
      } as any)
    )

    expect(created).toMatchObject({
      scopeId: 'project-1',
      definitionId: 'wf-sqlite-template',
      name: 'SQLite Template Workflow',
    })
  })
})
