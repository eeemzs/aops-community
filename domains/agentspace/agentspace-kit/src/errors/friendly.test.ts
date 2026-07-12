import { describe, expect, it } from 'vitest'
import { RepositoryError } from '@aopslab/xf-db'

import { toFriendlyError } from './friendly.js'

describe('agentspace friendly error mapping', () => {
  it('maps repository foreign-key violations to notFound semantics', () => {
    const error = new RepositoryError({
      repository: 'MemoryItemRepo',
      repositoryType: 'drizzle',
      message: 'Failed to create memory item',
      code: 'ForeignKeyViolation',
    })

    const friendly = toFriendlyError(error)

    expect(friendly.code).toBe('aops.notFound')
    expect(friendly.status).toBe(404)
    expect(friendly.messages[0]?.key).toBe('error__notFound')
  })

  it('maps repository not-null violations to validation semantics', () => {
    const error = new RepositoryError({
      repository: 'MemoryItemRepo',
      repositoryType: 'drizzle',
      message: 'Failed to create memory item',
      code: 'NotNullViolation',
    })

    const friendly = toFriendlyError(error)

    expect(friendly.code).toBe('aops.validation')
    expect(friendly.status).toBe(400)
    expect(friendly.messages[0]?.key).toBe('error__validation')
  })

  it('prefers nested foreign-key signals over generic failed query runtime text', () => {
    const driverError = new Error(
      '{"ok":false,"messages":[{"messageText":"foreign key kisitlamasini ihlal ediyor; anahtari mevcut degildir"}]}',
    )
    const topLevel = new Error('Failed to create: Failed query: insert into "memory-items"', {
      cause: driverError,
    })

    const friendly = toFriendlyError(topLevel)

    expect(friendly.code).toBe('aops.notFound')
    expect(friendly.status).toBe(404)
    expect(friendly.messages[0]?.key).toBe('error__notFound')
  })
})
