import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmSprintKanbanTaskLink } from '../../../../domain/models/index.js'
import { IdbSprintKanbanTaskLinkDrizzle, SprintKanbanTaskLinkColumnsDrizzle } from './drizzle.schema.sprintKanbanTaskLink.js'

const conversions: FieldConversionLookup<IbmSprintKanbanTaskLink, SprintKanbanTaskLinkColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  scopeId: { toDomain: uuidToString, toDb: stringToUuid },
  projectId: { toDomain: uuidToString, toDb: stringToUuid },
  sprintId: { toDomain: uuidToString, toDb: stringToUuid },
  kanbanTaskId: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperSprintKanbanTaskLinkDrizzle = createBmDbMapper<IbmSprintKanbanTaskLink, IdbSprintKanbanTaskLinkDrizzle, SprintKanbanTaskLinkColumnsDrizzle>(conversions);
