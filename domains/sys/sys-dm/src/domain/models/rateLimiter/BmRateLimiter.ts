import { BmBase, BmBaseConstructorParams } from '@aopslab/xf-bm';
import { IbmRateLimiter } from './IbmRateLimiter.js';
import { IRateLimiterMlgTags, IRateLimiterZodCtx, rateLimiterResources } from './resources.js';
import { createRateLimiterZodSchema } from './zod.schema.js';

export class BmRateLimiter extends BmBase<IbmRateLimiter, IRateLimiterMlgTags> {
  public static mlgFields: Partial<keyof IbmRateLimiter>[] = [];

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmRateLimiter>) {
    super({ data, locale, fallbackLocale, logger }, rateLimiterResources);
  }

  public buildSchemas(zodCtx: IRateLimiterZodCtx) {
    return {
      default: createRateLimiterZodSchema(zodCtx)
    };
  }
}
