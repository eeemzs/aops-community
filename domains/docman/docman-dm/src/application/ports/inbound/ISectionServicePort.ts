import { Effect } from 'effect'
import { SectionServiceError } from '../../errors/SectionServiceError.js'
import { IbmSection, IbmSectionInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'

export interface ISectionServicePort {
  getById(id: string, options?: DbQueryOptions<IbmSection>): Effect.Effect<IbmSection | null, SectionServiceError>
  create(data: IbmSectionInsert): Effect.Effect<IbmSection, SectionServiceError>
  listSections(filter?: Partial<IbmSection>, options?: DbQueryOptions<IbmSection>): Effect.Effect<IbmSection[], SectionServiceError>
  updateSection(id: string, patch: Partial<IbmSection>): Effect.Effect<IbmSection, SectionServiceError>
  removeSection(id: string): Effect.Effect<void, SectionServiceError>
  //==> custom-methods
  // getByDummyString(dummy: string): Effect.Effect<IbmSection | null, SectionServiceError>
  //<==//
}

export interface ISectionLookupPort {
  getById(id: string): Effect.Effect<IbmSection | null, SectionServiceError>
}

