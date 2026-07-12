import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmTaskLabelLink } from '../../../../domain/models/index.js'
import { IdbTaskLabelLinkDrizzle, TaskLabelLinkColumnsDrizzle } from './drizzle.schema.taskLabelLink.js'

const conversions: FieldConversionLookup<IbmTaskLabelLink, TaskLabelLinkColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
}

export const mapperTaskLabelLinkDrizzle =
  createBmDbMapper<IbmTaskLabelLink, IdbTaskLabelLinkDrizzle, TaskLabelLinkColumnsDrizzle>(conversions)
