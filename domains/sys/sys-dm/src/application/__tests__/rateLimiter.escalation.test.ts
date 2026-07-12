import { describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { failureLegacy, successLegacy, XfResultLegacy as XfResult } from '@aopslab/xf-core';

import { IbmRateLimiter } from '../../domain/models';
import { rateLimiterCommonNewAttempt } from '../../infrastructure/repositories/rateLimiter/rateLimiter.common';
import { RateLimitRule } from '../ports/types';

type StoredRateLimiter = IbmRateLimiter & { id: string };

function cloneDate(value: Date | null | undefined): Date | null | undefined {
  return value instanceof Date ? new Date(value.getTime()) : value;
}

function cloneRateLimiter(value: StoredRateLimiter): StoredRateLimiter {
  return {
    ...value,
    windowStart: cloneDate(value.windowStart),
    resetAt: cloneDate(value.resetAt),
    blockedAt: cloneDate(value.blockedAt),
    lastViolationAt: cloneDate(value.lastViolationAt)
  };
}

function createMemoryAdapters() {
  let sequence = 0;
  let stored: StoredRateLimiter | undefined;

  return {
    getStored: () => (stored ? cloneRateLimiter(stored) : undefined),
    setStored: (value: StoredRateLimiter) => {
      stored = cloneRateLimiter(value);
    },
    findSingle: async (key: string, scope: string): Promise<XfResult<IbmRateLimiter>> => {
      if (!stored || stored.key !== key || stored.scope !== scope) {
        return failureLegacy({ messageText: 'not found', opts: {} });
      }
      return successLegacy<IbmRateLimiter>(cloneRateLimiter(stored));
    },
    create: async (dm: IbmRateLimiter): Promise<XfResult<IbmRateLimiter>> => {
      stored = { ...dm, id: `rl-${++sequence}` };
      return successLegacy<IbmRateLimiter>(cloneRateLimiter(stored));
    },
    updateById: async (id: string, dm: IbmRateLimiter): Promise<XfResult<IbmRateLimiter>> => {
      if (!stored || stored.id !== id) {
        return failureLegacy({ messageText: 'not found', opts: {} });
      }
      stored = { ...dm, id };
      return successLegacy<IbmRateLimiter>(cloneRateLimiter(stored));
    },
    deleteById: async (id: string): Promise<XfResult<number>> => {
      if (stored?.id === id) {
        stored = undefined;
        return successLegacy(1);
      }
      return successLegacy(0);
    }
  };
}

function toMs(value: Date | null | undefined): number {
  if (!value) throw new Error('missing timestamp');
  return value.getTime();
}

function blockSeconds(rateLimiter: IbmRateLimiter | undefined): number {
  if (!rateLimiter) throw new Error('missing rate limiter');
  return Math.round((toMs(rateLimiter.resetAt) - toMs(rateLimiter.blockedAt)) / 1000);
}

async function recordAttempt(adapters: ReturnType<typeof createMemoryAdapters>, rule: RateLimitRule) {
  return Effect.runPromise(
    rateLimiterCommonNewAttempt(
      adapters.findSingle,
      adapters.create,
      adapters.updateById,
      adapters.deleteById,
      'user@example.com',
      'login',
      rule
    )
  );
}

function expireCurrentWindow(adapters: ReturnType<typeof createMemoryAdapters>) {
  const stored = adapters.getStored();
  if (!stored) throw new Error('missing stored rate limiter');
  adapters.setStored({ ...stored, resetAt: new Date(Date.now() - 10) });
}

describe('rateLimiterCommonNewAttempt escalation', () => {
  it('keeps fixed block duration when escalation is not configured', async () => {
    const adapters = createMemoryAdapters();
    const rule: RateLimitRule = { maxAttempts: 1, blockDurationInSeconds: 30 };

    expect((await recordAttempt(adapters, rule)).isBlocked).toBe(false);
    const firstBlock = await recordAttempt(adapters, rule);
    expect(firstBlock.isBlocked).toBe(true);
    expect(firstBlock.rateLimiter?.violationStreak).toBe(1);
    expect(blockSeconds(firstBlock.rateLimiter)).toBe(30);

    expireCurrentWindow(adapters);
    const cleanWindow = await recordAttempt(adapters, rule);
    expect(cleanWindow.isBlocked).toBe(false);
    expect(cleanWindow.rateLimiter?.violationStreak).toBe(1);

    const secondBlock = await recordAttempt(adapters, rule);
    expect(secondBlock.isBlocked).toBe(true);
    expect(secondBlock.rateLimiter?.violationStreak).toBe(2);
    expect(blockSeconds(secondBlock.rateLimiter)).toBe(30);
  });

  it('escalates consecutive fresh blocks and caps the duration', async () => {
    const adapters = createMemoryAdapters();
    const rule: RateLimitRule = {
      maxAttempts: 1,
      blockDurationInSeconds: 10,
      backoffMultiplier: 2,
      maxBlockDurationInSeconds: 25
    };

    await recordAttempt(adapters, rule);
    const firstBlock = await recordAttempt(adapters, rule);
    expect(firstBlock.rateLimiter?.violationStreak).toBe(1);
    expect(blockSeconds(firstBlock.rateLimiter)).toBe(10);

    const repeatedDuringActiveBlock = await recordAttempt(adapters, rule);
    expect(repeatedDuringActiveBlock.rateLimiter?.violationStreak).toBe(1);
    expect(blockSeconds(repeatedDuringActiveBlock.rateLimiter)).toBe(10);

    expireCurrentWindow(adapters);
    await recordAttempt(adapters, rule);
    const secondBlock = await recordAttempt(adapters, rule);
    expect(secondBlock.rateLimiter?.violationStreak).toBe(2);
    expect(blockSeconds(secondBlock.rateLimiter)).toBe(20);

    expireCurrentWindow(adapters);
    await recordAttempt(adapters, rule);
    const cappedBlock = await recordAttempt(adapters, rule);
    expect(cappedBlock.rateLimiter?.violationStreak).toBe(3);
    expect(blockSeconds(cappedBlock.rateLimiter)).toBe(25);
  });

  it('resets the streak after a clean window expires', async () => {
    const adapters = createMemoryAdapters();
    const rule: RateLimitRule = {
      maxAttempts: 1,
      blockDurationInSeconds: 10,
      backoffMultiplier: 2,
      maxBlockDurationInSeconds: 40
    };

    await recordAttempt(adapters, rule);
    const firstBlock = await recordAttempt(adapters, rule);
    expect(firstBlock.rateLimiter?.violationStreak).toBe(1);

    expireCurrentWindow(adapters);
    const cleanWindow = await recordAttempt(adapters, rule);
    expect(cleanWindow.rateLimiter?.violationStreak).toBe(1);
    expect(cleanWindow.rateLimiter?.blockedAt).toBeNull();

    expireCurrentWindow(adapters);
    const afterCleanWindow = await recordAttempt(adapters, rule);
    expect(afterCleanWindow.rateLimiter?.violationStreak).toBe(0);

    const blockAfterReset = await recordAttempt(adapters, rule);
    expect(blockAfterReset.rateLimiter?.violationStreak).toBe(1);
    expect(blockSeconds(blockAfterReset.rateLimiter)).toBe(10);
  });
});
