import { IbmRateLimiter } from './IbmRateLimiter.js';
import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm';
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation';

export interface IRateLimiterMlgTags {
  dummy: string;
}

export const rateLimiterResources: BmResourceInline<IbmRateLimiter, IRateLimiterMlgTags> = {
  fields: {
    key: {
      label: {
        en: 'Key',
        tr: 'Anahtar'
      }
    },
    scope: {
      label: {
        en: 'Scope',
        tr: 'Kapsam'
      }
    },
    attempts: {
      label: {
        en: 'Attempts',
        tr: 'Deneme'
      }
    },
    windowStart: {
      label: {
        en: 'Window Start',
        tr: 'Pencere Başlangıç'
      }
    },
    resetAt: {
      label: {
        en: 'Reset At',
        tr: 'Sıfırlama Tarihi'
      }
    },
    blockedAt: {
      label: {
        en: 'Blocked At',
        tr: 'Engellendiği Tarih'
      }
    },
    violationStreak: {
      label: {
        en: 'Violation Streak',
        tr: 'İhlal Serisi'
      }
    },
    lastViolationAt: {
      label: {
        en: 'Last Violation At',
        tr: 'Son İhlal Tarihi'
      }
    }
  },
  tags: {
    dummy: {
      en: 'Dummy',
      tr: 'Dummy'
    }
  }
}; //as const satisfies BmResourceInline<IbmRateLimiter, IRateLimiterMlgTags>

// export type rateLimiterResourceKeys = DotNestedKeys<typeof rateLimiterResources>
// export type rateLimiterResourceKeysWithField = DotNestedKeysBasic<typeof rateLimiterResources.fields>
// export type rateLimiterResourceKeysWithTag = DotNestedKeysBasic<typeof rateLimiterResources.tags>

export type IRateLimiterTranslationKeys = I18nBmValidKeys<IbmRateLimiter, ValidationResourceType, IRateLimiterMlgTags>;
export type IRateLimiterZodCtx = I18nZodContextWithChain<IbmRateLimiter, IRateLimiterTranslationKeys>;
