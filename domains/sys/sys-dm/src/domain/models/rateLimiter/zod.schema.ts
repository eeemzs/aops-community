import { z } from 'zod';
import { IRateLimiterZodCtx } from './resources.js';

export const createRateLimiterZodSchema = (ctx: IRateLimiterZodCtx) => {
  const { forField } = ctx;
  // const { v, f, t, forField } = ctx
  // t('fields.age.label')

  const schema = z.object({
    ...forField('key').min(2).done(),
    type: z.enum(['login', 'register']),
    attempts: z.number().int().optional(),
    windowStart: z.date().optional(),
    resetAt: z.date().optional(),
    blockedAt: z.date().optional(),
    violationStreak: z.number().int().nonnegative().optional(),
    lastViolationAt: z.date().optional(),
    blockExpiresAt: z.date().optional()
  });

  return schema;
};
