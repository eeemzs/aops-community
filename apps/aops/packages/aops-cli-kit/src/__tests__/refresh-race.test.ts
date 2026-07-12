import test from 'node:test'
import assert from 'node:assert/strict'

import { createRefreshRaceRecovery, type RefreshRaceTokens } from '../refresh-race.js'

const noSleep = async () => {}

test('recovers when a concurrent winner rotated the refresh token in the shared store', async () => {
  let current = 'stale-refresh'
  const applied: RefreshRaceTokens[] = []
  let reads = 0

  const recover = createRefreshRaceRecovery({
    getCurrentRefreshToken: () => current,
    readLatestTokens: () => {
      reads += 1
      // The winner writes the rotated pair only after the first poll.
      if (reads >= 2) return { accessToken: 'new-access', refreshToken: 'new-refresh', userId: 'u1' }
      return { accessToken: 'stale-access', refreshToken: 'stale-refresh' }
    },
    applyTokens: (t) => {
      applied.push(t)
      current = t.refreshToken
    },
    sleep: noSleep,
  })

  const ok = await recover()
  assert.equal(ok, true)
  assert.equal(applied.length, 1)
  assert.equal(applied[0]?.refreshToken, 'new-refresh')
  assert.equal(applied[0]?.accessToken, 'new-access')
})

test('returns false when no newer token ever appears (genuine failure, no loop)', async () => {
  const recover = createRefreshRaceRecovery({
    getCurrentRefreshToken: () => 'stale-refresh',
    readLatestTokens: () => ({ accessToken: 'a', refreshToken: 'stale-refresh' }),
    applyTokens: () => {
      throw new Error('must not apply an unchanged token')
    },
    maxAttempts: 3,
    sleep: noSleep,
  })

  assert.equal(await recover(), false)
})

test('tolerates transient read errors and keeps polling', async () => {
  let reads = 0
  const recover = createRefreshRaceRecovery({
    getCurrentRefreshToken: () => 'stale',
    readLatestTokens: () => {
      reads += 1
      if (reads === 1) throw new Error('transient read error')
      return { accessToken: 'a2', refreshToken: 'fresh' }
    },
    applyTokens: () => {},
    sleep: noSleep,
  })

  assert.equal(await recover(), true)
  assert.ok(reads >= 2)
})

test('returns false when the shared store has no tokens', async () => {
  const recover = createRefreshRaceRecovery({
    getCurrentRefreshToken: () => 'stale',
    readLatestTokens: () => null,
    applyTokens: () => {
      throw new Error('must not apply when store is empty')
    },
    maxAttempts: 2,
    sleep: noSleep,
  })

  assert.equal(await recover(), false)
})

test('stops at maxAttempts polls when the winner never writes', async () => {
  let reads = 0
  const recover = createRefreshRaceRecovery({
    getCurrentRefreshToken: () => 'stale',
    readLatestTokens: () => {
      reads += 1
      return { accessToken: 'a', refreshToken: 'stale' }
    },
    applyTokens: () => {},
    maxAttempts: 4,
    sleep: noSleep,
  })

  assert.equal(await recover(), false)
  assert.equal(reads, 4)
})
