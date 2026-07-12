import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmExperienceItem } from '../../../../domain/models/index.js'
import { IRepositoryPortExperienceItem } from '../../../../application/ports/repository-ports/index.js'
import { IdbExperienceItemDrizzle, experienceItemTable } from '../../../db/experienceItem/drizzle/drizzle.schema.experienceItem.js'
import { mapperExperienceItemDrizzle } from '../../../db/experienceItem/drizzle/drizzle.mapper.experienceItem.js'

export class ExperienceItemDrizzleRepo extends DraBase<IbmExperienceItem, IdbExperienceItemDrizzle, typeof experienceItemTable> implements IRepositoryPortExperienceItem {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(experienceItemTable, { mapper: mapperExperienceItemDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
