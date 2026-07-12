import { Effect } from 'effect'
import { DbQueryOptions } from '@aopslab/xf-db'
import { IssueItemServiceError } from '../../errors/IssueItemServiceError.js'
import { IbmIssueItem, IbmIssueItemInsert } from '../../../domain/models/index.js'

export type IssueItemCreateInput = Omit<IbmIssueItemInsert, 'status' | 'severity' | 'source' | 'openedAt'> & {
  status?: IbmIssueItemInsert['status']
  severity?: IbmIssueItemInsert['severity']
  source?: IbmIssueItemInsert['source']
  openedAt?: Date
}

export interface IIssueItemServicePort {
  getById(id: string, options?: DbQueryOptions<IbmIssueItem>): Effect.Effect<IbmIssueItem | null, IssueItemServiceError>
  create(data: IbmIssueItemInsert): Effect.Effect<IbmIssueItem, IssueItemServiceError>
  createIssue(input: IssueItemCreateInput): Effect.Effect<IbmIssueItem, IssueItemServiceError>
  updateIssue(id: string, patch: Partial<IbmIssueItem>): Effect.Effect<IbmIssueItem, IssueItemServiceError>
  listIssues(filter?: Partial<IbmIssueItem>, options?: DbQueryOptions<IbmIssueItem>): Effect.Effect<IbmIssueItem[], IssueItemServiceError>
  removeIssue(id: string): Effect.Effect<void, IssueItemServiceError>
  //==> custom-methods
  //<==//
}

export interface IIssueItemLookupPort {
  getById(id: string): Effect.Effect<IbmIssueItem | null, IssueItemServiceError>
}
