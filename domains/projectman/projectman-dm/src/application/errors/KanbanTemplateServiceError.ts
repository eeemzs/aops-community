import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum KanbanTemplateErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const KanbanTemplateErrorTag = {
  Domain: 'KanbanTemplateDomainError',
} as const

export class KanbanTemplateDomainError extends Data.TaggedError(KanbanTemplateErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type KanbanTemplateServiceError = KanbanTemplateDomainError | XfError | RepositoryError | XfUpsertError
