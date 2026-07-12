import { KeysOf } from '@aopslab/xf-i18n'
import { BmResourceInline, I18nBm } from '@aopslab/xf-i18n/bm'
import {
  toFriendlyError,
  type XfFriendlyError,
} from './friendly.js'
import {
  sysErrorsResources,
  type ILabelsSysServerErrorsTags,
} from '../resources/index.js'

export type TranslateOptions = {
  locale?: string
  defaultLocale?: string
  overrideResourceWith?: BmResourceInline<never, ILabelsSysServerErrorsTags>
}

type SysErrorTagKey = KeysOf<ILabelsSysServerErrorsTags>

const FALLBACK_KEY: SysErrorTagKey = 'error__unexpected'

function resolvePrimaryKey(friendly: XfFriendlyError): SysErrorTagKey {
  const first = friendly.messages[0]?.key
  if (!first) return FALLBACK_KEY
  const tags = sysErrorsResources.tags ?? {}
  if (first in tags) return first as SysErrorTagKey
  return FALLBACK_KEY
}

function translateKey(key: SysErrorTagKey, translateOpts?: TranslateOptions): string {
  const locale = translateOpts?.locale ?? 'en'
  const defaultLocale = translateOpts?.defaultLocale ?? 'en'
  const i18nBm = new I18nBm<never, ILabelsSysServerErrorsTags>({
    inlineResources: translateOpts?.overrideResourceWith ?? sysErrorsResources,
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
  translationKey: SysErrorTagKey
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
