import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmEmbed } from '../../../../domain/models/index.js'
import { IRepositoryPortEmbed } from '../../../../application/ports/repository-ports/index.js'
import { IdbEmbedDrizzleSqlite, embedTableSqlite } from '../../../db/embed/drizzle/drizzle.schema.embed.sqlite.js'
import { mapperEmbedDrizzle } from '../../../db/embed/drizzle/drizzle.mapper.embed.js'

export class EmbedDrizzleSqliteRepo
  extends DraBaseSqlite<IbmEmbed, IdbEmbedDrizzleSqlite, typeof embedTableSqlite>
  implements IRepositoryPortEmbed
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(embedTableSqlite, { mapper: mapperEmbedDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
