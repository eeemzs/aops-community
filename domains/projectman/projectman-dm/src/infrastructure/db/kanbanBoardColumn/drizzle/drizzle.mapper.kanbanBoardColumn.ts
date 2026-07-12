import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmKanbanBoardColumn } from '../../../../domain/models/index.js'
import { IdbKanbanBoardColumnDrizzle, KanbanBoardColumnColumnsDrizzle } from './drizzle.schema.kanbanBoardColumn.js'

const conversions: FieldConversionLookup<IbmKanbanBoardColumn, KanbanBoardColumnColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  scopeId: { toDomain: uuidToString, toDb: stringToUuid },
  boardId: { toDomain: uuidToString, toDb: stringToUuid },
  columnId: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperKanbanBoardColumnDrizzle = createBmDbMapper<IbmKanbanBoardColumn, IdbKanbanBoardColumnDrizzle, KanbanBoardColumnColumnsDrizzle>(conversions);
