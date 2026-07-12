import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmArtifact } from './IbmArtifact.js'

export interface IArtifactMlgTags {
  // add keys here if needed
}

export const artifactResources: BmResourceInline<IbmArtifact, IArtifactMlgTags> = {
  fields: {}
}

export type IArtifactTranslationKeys = I18nBmValidKeys<IbmArtifact, ValidationResourceType, IArtifactMlgTags>
export type IArtifactZodCtx = I18nZodContextWithChain<IbmArtifact, IArtifactTranslationKeys>
