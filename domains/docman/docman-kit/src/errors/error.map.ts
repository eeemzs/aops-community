import { KeysOf } from '@aopslab/xf-i18n'
import { BmResourceInline, I18nBm } from '@aopslab/xf-i18n/bm'
import {
  toFriendlyError,
  type XfFriendlyError,
} from './friendly.js'
import {
  docmanErrorsResources,
  type ILabelsDocmanServerErrorsTags,
} from '../resources/index.js'

export type TranslateOptions = {
  locale?: string
  defaultLocale?: string
  overrideResourceWith?: BmResourceInline<never, ILabelsDocmanServerErrorsTags>
}

type DocmanErrorTagKey = KeysOf<ILabelsDocmanServerErrorsTags>

const FALLBACK_KEY: DocmanErrorTagKey = 'error__unexpected'

function resolvePrimaryKey(friendly: XfFriendlyError): DocmanErrorTagKey {
  const first = friendly.messages[0]?.key
  if (!first) return FALLBACK_KEY
  const tags = docmanErrorsResources.tags ?? {}
  if (first in tags) return first as DocmanErrorTagKey
  return FALLBACK_KEY
}

function translateKey(key: DocmanErrorTagKey, translateOpts?: TranslateOptions): string {
  const locale = translateOpts?.locale ?? 'en'
  const defaultLocale = translateOpts?.defaultLocale ?? 'en'
  const i18nBm = new I18nBm<never, ILabelsDocmanServerErrorsTags>({
    inlineResources: translateOpts?.overrideResourceWith ?? docmanErrorsResources,
    config: {
      defaultLocale,
      fallbackLocale: defaultLocale,
    },
  })
  const t = i18nBm.getTagTranslator({ locale })
  return t(key)
}

export function mapErrorToFriendly(
  error: unknown,
  translateOpts?: TranslateOptions
): XfFriendlyError & { message: string } {
  const friendly = toFriendlyError(error)
  const translationKey = resolvePrimaryKey(friendly)
  const message = translateKey(translationKey, translateOpts)
  return {
    ...friendly,
    message,
  }
}

export function mapErrorToFriendlyText(
  error: unknown,
  translateOpts?: TranslateOptions
): {
  translatedMessageText: string
  translationKey: DocmanErrorTagKey
  errorCode?: string
  domainTag?: string
  friendly: XfFriendlyError
} {
  const friendly = toFriendlyError(error)
  const translationKey = resolvePrimaryKey(friendly)
  const translatedMessageText = translateKey(translationKey, translateOpts)

  return {
    translatedMessageText,
    translationKey,
    errorCode: friendly.code,
    domainTag: friendly.scope,
    friendly,
  }
}
