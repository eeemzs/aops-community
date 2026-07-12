import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmArtifactLink } from './IbmArtifactLink.js'

export interface IArtifactLinkMlgTags {
  // add keys here if needed
  dummy?: string
}

export const artifactLinkResources: BmResourceInline<IbmArtifactLink, IArtifactLinkMlgTags> = {
  fields: {}
}

export type IArtifactLinkTranslationKeys = I18nBmValidKeys<IbmArtifactLink, ValidationResourceType, IArtifactLinkMlgTags>
export type IArtifactLinkZodCtx = I18nZodContextWithChain<IbmArtifactLink, IArtifactLinkTranslationKeys>

