import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum SprintKanbanTaskLinkErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const SprintKanbanTaskLinkErrorTag = {
  Domain: 'SprintKanbanTaskLinkDomainError',
} as const

export class SprintKanbanTaskLinkDomainError extends Data.TaggedError(SprintKanbanTaskLinkErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type SprintKanbanTaskLinkServiceError = SprintKanbanTaskLinkDomainError | XfError | RepositoryError | XfUpsertError
