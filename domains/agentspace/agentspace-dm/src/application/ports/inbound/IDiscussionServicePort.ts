import { Effect } from 'effect'
import { DbQueryOptions } from '@aopslab/xf-db'
import { DiscussionServiceError } from '../../errors/DiscussionServiceError.js'
import {
  IbmDiscussionOutput,
  IbmDiscussionOutputInsert,
  IbmDiscussionTopic,
  IbmDiscussionTopicInsert,
  IbmDiscussionTurn,
  IbmDiscussionTurnInsert,
} from '../../../domain/models/index.js'
import type { DiscussionBlockedOn, DiscussionTopicStatus, ScopeResolution } from '../../../domain/types.js'

export type DiscussionTopicCreateInput =
  Pick<IbmDiscussionTopicInsert, 'scopeId' | 'slug' | 'title' | 'question' | 'initiatorAgentId'> &
  Partial<Omit<IbmDiscussionTopicInsert, 'scopeId' | 'slug' | 'title' | 'question' | 'initiatorAgentId' | 'status' | 'lastSeq'>> &
  Partial<Pick<IbmDiscussionTopicInsert, 'status' | 'lastSeq'>>

export type DiscussionTopicListFilter = Partial<IbmDiscussionTopic> & {
  scopeResolution?: ScopeResolution
}

export type DiscussionTurnAddInput =
  Omit<IbmDiscussionTurnInsert, 'seq'> & {
    expectedSeq?: number
  }

export type DiscussionTurnListFilter = Partial<IbmDiscussionTurn> & {
  afterSeq?: number
}

export type DiscussionOutputSetInput = IbmDiscussionOutputInsert

export type DiscussionTopicDetail = {
  topic: IbmDiscussionTopic
  turns: IbmDiscussionTurn[]
  outputs: IbmDiscussionOutput[]
}

export type DiscussionOpenQuestion = {
  seq: number
  agentId: string
  text: string
}

export type DiscussionStatus = {
  topicId: string
  status: DiscussionTopicStatus
  blockedOn: DiscussionBlockedOn | null
  nextSpeaker: string | null
  canConclude: boolean
  openQuestions: DiscussionOpenQuestion[]
  reason: string
}

export interface IDiscussionServicePort {
  createTopic(data: DiscussionTopicCreateInput): Effect.Effect<IbmDiscussionTopic, DiscussionServiceError>
  getTopic(id: string): Effect.Effect<DiscussionTopicDetail, DiscussionServiceError>
  listTopics(
    filter?: DiscussionTopicListFilter,
    options?: DbQueryOptions<IbmDiscussionTopic>
  ): Effect.Effect<IbmDiscussionTopic[], DiscussionServiceError>
  addTurn(data: DiscussionTurnAddInput): Effect.Effect<IbmDiscussionTurn, DiscussionServiceError>
  conclude(topicId: string, updatedBy?: string): Effect.Effect<IbmDiscussionTopic, DiscussionServiceError>
  abandon(topicId: string, reason?: string): Effect.Effect<IbmDiscussionTopic, DiscussionServiceError>
  setOutput(data: DiscussionOutputSetInput): Effect.Effect<IbmDiscussionOutput, DiscussionServiceError>
  status(topicId: string): Effect.Effect<DiscussionStatus, DiscussionServiceError>
}
