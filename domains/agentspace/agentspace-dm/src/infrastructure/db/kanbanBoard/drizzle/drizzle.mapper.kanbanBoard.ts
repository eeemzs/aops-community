import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmKanbanBoard } from '../../../../domain/models/index.js'
import { IdbKanbanBoardDrizzle, KanbanBoardColumnsDrizzle } from './drizzle.schema.kanbanBoard.js'

const conversions: FieldConversionLookup<IbmKanbanBoard, KanbanBoardColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperKanbanBoardDrizzle = createBmDbMapper<IbmKanbanBoard, IdbKanbanBoardDrizzle, KanbanBoardColumnsDrizzle>(conversions);
