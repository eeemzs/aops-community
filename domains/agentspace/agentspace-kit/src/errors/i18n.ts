import type { I18nBm } from '@aopslab/xf-i18n/bm'
import {
  friendlyErrorToResultI18n,
  toFriendlyError,
  type XfFriendlyError,
} from './friendly.js'

export function friendlyErrorToResultWithI18n<
  TData = unknown,
  TField extends object = object,
  TTag extends object = object,
  TValidation extends object = object,
>(
  friendly: XfFriendlyError,
  i18nBm: I18nBm<TField, TTag, TValidation>,
  locale?: string
) {
  const t = i18nBm.getTagTranslator({ locale })
  return friendlyErrorToResultI18n<TData, keyof TTag & string>(friendly, t)
}

export function errorToResultWithI18n<
  TData = unknown,
  TField extends object = object,
  TTag extends object = object,
  TValidation extends object = object,
>(
  error: unknown,
  i18nBm: I18nBm<TField, TTag, TValidation>,
  locale?: string
) {
  const t = i18nBm.getTagTranslator({ locale })
  const friendly = toFriendlyError(error)
  return friendlyErrorToResultI18n<TData, keyof TTag & string>(friendly, t)
}
