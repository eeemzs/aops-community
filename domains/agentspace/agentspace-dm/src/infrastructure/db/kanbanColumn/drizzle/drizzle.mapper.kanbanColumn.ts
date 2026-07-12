import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmKanbanColumn } from '../../../../domain/models/index.js'
import { IdbKanbanColumnDrizzle, KanbanColumnColumnsDrizzle } from './drizzle.schema.kanbanColumn.js'

const conversions: FieldConversionLookup<IbmKanbanColumn, KanbanColumnColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperKanbanColumnDrizzle = createBmDbMapper<IbmKanbanColumn, IdbKanbanColumnDrizzle, KanbanColumnColumnsDrizzle>(conversions);
