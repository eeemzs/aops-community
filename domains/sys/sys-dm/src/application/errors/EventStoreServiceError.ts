import { XfError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'
import { ErrorDomainSys } from '../../domain/domain.js'

/**
 * EventStore Domain Hata Modeli — Kısa Rehber
 * - Tek Tag: Domain hataları tek tag altında gruplanır.
 * - Enum Code: İnce ayrımlar enum `code` ile ifade edilir.
 * - Validation: XfError pass-through.
 * - RepositoryError: adapter/port tarafından üretilir; gerekirse service içinde mapDbError ile domain'e çevrilir.
 */
export enum EventStoreErrorCode {
  PublishFailed = 'PublishFailed',
  ReadFailed = 'ReadFailed',
  CleanupFailed = 'CleanupFailed',
}

export const EventStoreErrorTag = {
  Domain: `${ErrorDomainSys.DomainEvent}`,
} as const

export class EventStoreDomainError extends Data.TaggedError(EventStoreErrorTag.Domain)<WithBaseErrorFields<{ eventType?: string; aggregateId?: string }>> {}

export type EventStoreServiceError = EventStoreDomainError | XfError | RepositoryError

export const EventStoreErrorFactory = {
  eventStoreDomainError: (params: WithBaseErrorFields<{ eventType?: string; aggregateId?: string }>): EventStoreDomainError => new EventStoreDomainError(params),
}
