import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmKanbanTask } from '../../../../domain/models/index.js'
import { IdbKanbanTaskDrizzle, KanbanTaskColumnsDrizzle } from './drizzle.schema.kanbanTask.js'

const stringToNullableUuid = (value?: string | null): string | null | undefined => {
  if (value === null) return null
  return stringToUuid(value)
}

const conversions: FieldConversionLookup<IbmKanbanTask, KanbanTaskColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  scopeId: { toDomain: uuidToString, toDb: stringToUuid },
  boardId: { toDomain: uuidToString, toDb: stringToUuid },
  boardColumnId: { toDomain: uuidToString, toDb: stringToUuid },
  sprintId: { toDomain: uuidToString, toDb: stringToNullableUuid as any },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperKanbanTaskDrizzle = createBmDbMapper<IbmKanbanTask, IdbKanbanTaskDrizzle, KanbanTaskColumnsDrizzle>(conversions);
