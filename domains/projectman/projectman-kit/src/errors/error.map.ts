import { KeysOf } from '@aopslab/xf-i18n'
import { BmResourceInline, I18nBm } from '@aopslab/xf-i18n/bm'
import {
  toFriendlyError,
  type XfFriendlyError,
} from './friendly.js'
import {
  projectmanErrorsResources,
  type ILabelsProjectmanServerErrorsTags,
} from '../resources/index.js'

export type TranslateOptions = {
  locale?: string
  defaultLocale?: string
  overrideResourceWith?: BmResourceInline<never, ILabelsProjectmanServerErrorsTags>
}

type ProjectmanErrorTagKey = KeysOf<ILabelsProjectmanServerErrorsTags>

const FALLBACK_KEY: ProjectmanErrorTagKey = 'error__unexpected'

function resolvePrimaryKey(friendly: XfFriendlyError): ProjectmanErrorTagKey {
  const first = friendly.messages[0]?.key
  if (!first) return FALLBACK_KEY
  const tags = projectmanErrorsResources.tags ?? {}
  if (first in tags) return first as ProjectmanErrorTagKey
  return FALLBACK_KEY
}

function translateKey(key: ProjectmanErrorTagKey, translateOpts?: TranslateOptions): string {
  const locale = translateOpts?.locale ?? 'en'
  const defaultLocale = translateOpts?.defaultLocale ?? 'en'
  const i18nBm = new I18nBm<never, ILabelsProjectmanServerErrorsTags>({
    inlineResources: translateOpts?.overrideResourceWith ?? projectmanErrorsResources,
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
  translationKey: ProjectmanErrorTagKey
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
