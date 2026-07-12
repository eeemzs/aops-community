import type { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import type { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import type { IbmCounter } from './IbmCounter.js'

export interface ICounterMlgTags {}

export const counterResources: BmResourceInline<IbmCounter, ICounterMlgTags> = {
  fields: {
    counterKey: {
      label: { en: 'Counter key', tr: 'Sayac anahtari' },
    },
    scopeId: {
      label: { en: 'Scope', tr: 'Kapsam' },
    },
    prefix: {
      label: { en: 'Prefix', tr: 'On ek' },
    },
    width: {
      label: { en: 'Width', tr: 'Hane' },
    },
    nextValue: {
      label: { en: 'Next value', tr: 'Siradaki deger' },
    },
    step: {
      label: { en: 'Step', tr: 'Artis' },
    },
  },
}

export type ICounterTranslationKeys = I18nBmValidKeys<IbmCounter, ValidationResourceType, ICounterMlgTags>
export type ICounterZodCtx = I18nZodContextWithChain<IbmCounter, ICounterTranslationKeys>
