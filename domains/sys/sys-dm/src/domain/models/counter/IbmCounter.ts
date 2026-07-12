import { Ibm } from '@aopslab/xf-bm'

export interface IbmCounter extends Ibm {
  scopeId: string
  counterKey: string
  prefix?: string | null
  width?: number | null
  nextValue: number
  step: number
  lastValue?: number | null
  lastFormattedValue?: string | null
  metadataJson?: Record<string, unknown> | null
}

export const IbmCounterKeys = [
  'id',
  'tenantId',
  'scopeId',
  'counterKey',
  'prefix',
  'width',
  'nextValue',
  'step',
  'lastValue',
  'lastFormattedValue',
  'metadataJson',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof IbmCounter)[]

export type IbmCounterKeysType = (typeof IbmCounterKeys)[number]
