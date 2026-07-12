import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum PlanningLineageErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const PlanningLineageErrorTag = {
  Domain: 'PlanningLineageDomainError',
} as const

export class PlanningLineageDomainError extends Data.TaggedError(PlanningLineageErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type PlanningLineageServiceError = PlanningLineageDomainError | XfError | RepositoryError | XfUpsertError
