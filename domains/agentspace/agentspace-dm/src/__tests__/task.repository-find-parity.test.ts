import { afterEach, describe, expect, it } from 'vitest'
import { Effect, Either } from 'effect'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { drizzleFind, drizzleSqliteDisconnect } from '@aopslab/xf-db-drizzle'

import { TaskDrizzleSqliteRepo } from '../infrastructure/repositories/task/drizzle/TaskDrizzleSqliteRepo.js'
import { taskTableSqlite } from '../infrastructure/db/task/drizzle/drizzle.schema.task.sqlite.js'

const tempDirs: string[] = []

afterEach(async () => {
  await drizzleSqliteDisconnect()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (!dir) continue
    rmSync(dir, { recursive: true, force: true })
  }
})

function createTaskSqliteFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'agentspace-task-repo-find-'))
  tempDirs.push(dir)
  const dbPath = join(dir, 'agentspace.sqlite')
  const db = new DatabaseSync(dbPath)

  db.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      scopeId TEXT NOT NULL,
      columnId TEXT NOT NULL,
      sprintId TEXT,
      promptVersionId TEXT,
      parentTaskId TEXT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      input TEXT,
      meta TEXT,
      assignee TEXT,
      position INTEGER NOT NULL,
      priority INTEGER,
      dueAt INTEGER,
      createdBy TEXT,
      updatedBy TEXT,
      createdAt INTEGER,
      updatedAt INTEGER
    );
    CREATE UNIQUE INDEX task_column_position_unique ON tasks (tenantId, columnId, position);
    CREATE INDEX task_idx_tenant ON tasks (tenantId);
    CREATE INDEX task_idx_scope ON tasks (tenantId, scopeId);
    CREATE INDEX task_idx_column ON tasks (tenantId, columnId);
    INSERT INTO tasks (id, tenantId, scopeId, columnId, type, title, position, createdAt, updatedAt)
      VALUES ('task-1', 'tenant-1', 'scope-1', 'column-1', 'task', 'First task', 0, 0, 0);
    INSERT INTO tasks (id, tenantId, scopeId, columnId, type, title, position, createdAt, updatedAt)
      VALUES ('task-2', 'tenant-1', 'scope-1', 'column-1', 'task', 'Second task', 1, 0, 0);
  `)
  db.close()

  const repo = new TaskDrizzleSqliteRepo({
    repositoryConfig: {
      repositoryType: 'drizzle',
      drizzleDialect: 'sqlite',
      tenantId: 'tenant-1',
      scopeId: 'scope-1',
      url: `file:${dbPath}`,
    },
  })

  return { repo }
}

describe('task repository sqlite parity', () => {
  it('keeps repo.find sort+limit behavior aligned with direct drizzleFind', async () => {
    const { repo } = createTaskSqliteFixture()

    const direct = await drizzleFind({
      db: await Effect.runPromise((repo as any).getDb()),
      table: taskTableSqlite,
      owner: 'task.repository-find-parity',
      matchEq: { tenantId: 'tenant-1', columnId: 'column-1' },
      options: { sort: [{ field: 'position', type: 'desc' }], limit: 1 },
      dialect: 'sqlite',
    } as any)
    const rows = await Effect.runPromise(
      repo.find({
        matchEq: { columnId: 'column-1' },
        options: { sort: [{ field: 'position', type: 'desc' }], limit: 1 },
      } as any),
    )

    expect(direct.ok).toBe(true)
    expect(direct.data).toHaveLength(1)
    expect(direct.data?.[0]).toMatchObject({
      id: 'task-2',
      position: 1,
      title: 'Second task',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'task-2',
      position: 1,
      title: 'Second task',
    })
  })

  it('preserves findSingle uniqueness semantics even when sort options are present', async () => {
    const { repo } = createTaskSqliteFixture()

    const outcome = await Effect.runPromise(
      Effect.either(
        repo.findSingle({
          matchEq: { columnId: 'column-1' },
          options: { sort: [{ field: 'position', type: 'desc' }] },
        } as any),
      ),
    )

    expect(Either.isLeft(outcome)).toBe(true)
    expect(outcome.left).toMatchObject({
      message: expect.stringContaining('Multiple records found'),
    })
  })
})
