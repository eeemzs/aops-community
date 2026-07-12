import { Effect } from 'effect'
import { DbQueryOptions } from '@aopslab/xf-db'
import type { ScopeResolution } from '../../../domain/types.js'
import { ActivityItemServiceError } from '../../errors/ActivityItemServiceError.js'
import { IbmActivityItem, IbmActivityItemInsert } from '../../../domain/models/index.js'

export interface ActivityItemListFilter {
  scopeId?: string
  scopeResolution?: ScopeResolution
  projectId?: string
  sourceKind?: string
  sourceId?: string
  action?: string
  status?: string
}

export interface IActivityItemServicePort {
  getById(id: string, options?: DbQueryOptions<IbmActivityItem>): Effect.Effect<IbmActivityItem | null, ActivityItemServiceError>
  create(data: IbmActivityItemInsert): Effect.Effect<IbmActivityItem, ActivityItemServiceError>
  addActivityItem(data: IbmActivityItemInsert): Effect.Effect<IbmActivityItem, ActivityItemServiceError>
  listActivityItems(
    filter?: ActivityItemListFilter,
    options?: DbQueryOptions<IbmActivityItem>
  ): Effect.Effect<IbmActivityItem[], ActivityItemServiceError>
}

export interface IActivityItemLookupPort {
  getById(id: string): Effect.Effect<IbmActivityItem | null, ActivityItemServiceError>
}
