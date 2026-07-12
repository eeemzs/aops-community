import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { ValidationResourceType } from '@aopslab/xf-validation'

export interface ILabelsAopsServerErrorsTags {
  error__validation: string
  error__notFound: string
  error__unauthorized: string
  error__forbidden: string
  error__conflict: string
  error__rateLimit: string
  error__serviceUnavailable: string
  error__unexpected: string
}

export const aopsErrorsResources: BmResourceInline<never, ILabelsAopsServerErrorsTags> = {
  tags: {
    error__validation: {
      en: 'Please review your input and try again.',
      tr: 'Lutfen girdinizi kontrol edip tekrar deneyin.',
    },
    error__notFound: {
      en: 'The requested record could not be found.',
      tr: 'Istenen kayit bulunamadi.',
    },
    error__unauthorized: {
      en: 'You need to sign in before continuing.',
      tr: 'Devam etmeden once giris yapmaniz gerekiyor.',
    },
    error__forbidden: {
      en: 'You do not have permission for this action.',
      tr: 'Bu islem icin yetkiniz yok.',
    },
    error__conflict: {
      en: 'This action conflicts with existing data.',
      tr: 'Bu islem mevcut verilerle cakisiyor.',
    },
    error__rateLimit: {
      en: 'Too many requests. Please try again shortly.',
      tr: 'Cok fazla istek yapildi. Lutfen kisa bir sure sonra tekrar deneyin.',
    },
    error__serviceUnavailable: {
      en: 'Service is temporarily unavailable. Please try again later.',
      tr: 'Servis gecici olarak kullanilamiyor. Lutfen daha sonra tekrar deneyin.',
    },
    error__unexpected: {
      en: 'An unexpected error occurred. Please try again.',
      tr: 'Beklenmeyen bir hata olustu. Lutfen tekrar deneyin.',
    },
  },
}

export type ILabelsAopsServerErrorsTranslationKeys = I18nBmValidKeys<
  never,
  ValidationResourceType,
  ILabelsAopsServerErrorsTags
>
