import { Effect } from 'effect'

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as {
    code?: unknown
    cause?: { code?: unknown; message?: unknown }
    message?: unknown
    _tag?: unknown
  }
  if (err.code === 'NotFound') return true
  if (err.cause?.code === 'NotFound') return true
  if (err._tag === 'RepositoryError' && err.code === 'NotFound') return true
  if (err._tag === 'NotFoundError') return true
  if (typeof err.message === 'string' && /failed to find\b|no record\(s\) found|record not found/i.test(err.message)) return true
  if (typeof err.cause?.message === 'string' && /failed to find\b|no record\(s\) found|record not found/i.test(err.cause.message)) return true
  return false
}

export async function safeFind<T = any, E = unknown>(effect: Effect.Effect<ReadonlyArray<T>, E, never>): Promise<T[]> {
  const items = await Effect.runPromise(
    Effect.catchAll(effect, (err) => {
      if (isNotFoundError(err)) {
        return Effect.succeed([] as ReadonlyArray<T>)
      }
      return Effect.fail(err)
    })
  )
  return Array.from(items)
}

export async function safeFindOne<T = any, E = unknown>(effect: Effect.Effect<T | null, E, never>): Promise<T | null> {
  return Effect.runPromise(
    Effect.catchAll(effect, (err) => {
      if (isNotFoundError(err)) {
        return Effect.succeed(null)
      }
      return Effect.fail(err)
    })
  )
}
