import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmKanbanTemplate } from '../../../../domain/models/index.js'
import { IdbKanbanTemplateDrizzle, KanbanTemplateColumnsDrizzle } from './drizzle.schema.kanbanTemplate.js'

const conversions: FieldConversionLookup<IbmKanbanTemplate, KanbanTemplateColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  scopeId: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperKanbanTemplateDrizzle = createBmDbMapper<IbmKanbanTemplate, IdbKanbanTemplateDrizzle, KanbanTemplateColumnsDrizzle>(conversions);
