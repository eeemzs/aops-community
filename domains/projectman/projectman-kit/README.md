# projectman-kit

projectman-kit kiti, domain servis ve repository'lerini hexagonal prensiplerle uygulamalara baglayan ince bir kopru saglar.
Bu scaffold, `inventory-kit` desenini takip eder ve domain'e ozel kodlari
`//==> custom ... <==//` bloklarinda izole eder.

## Hizli Kullanim (env ile)

```ts
import { createProjectmanKitWithEnv, getProjectmanKitEnvConfig } from '@aopslab/domain-kit-projectman'

const { kit } = createProjectmanKitWithEnv({
  envConfig: getProjectmanKitEnvConfig(),
  baseContext: {
    tenantId: 'tenant-1',
    locale: 'tr',
    fallbackLocale: 'en',
    logger,
  },
})

const service = await kit.getKanbanBoardService()
```

## Env Degiskenleri

- `TENANT_ID`
- `LOG_LEVEL`
- `PROJECTMAN_REPO_URL` (opsiyonel, pg/sqlite)
- `PROJECTMAN_PG_URL` (opsiyonel)
- `PROJECTMAN_SQLITE_URL` (opsiyonel)
- `AOPS_PG_URL` (fallback)
- `KANBAN_BOARD_REPO_URL`
- `KANBAN_COLUMN_REPO_URL`
- `KANBAN_BOARD_COLUMN_REPO_URL`
- `ISSUE_ITEM_REPO_URL`

## Sundugu Yuzey

Services:
- `kanbanBoardService`
- `kanbanColumnService`
- `kanbanBoardColumnService`
- `issueItemService`

Repositories:
- `kanbanBoardRepository`
- `kanbanColumnRepository`
- `kanbanBoardColumnRepository`
- `issueItemRepository`

## Notlar

- `tenantId` context icinde zorunludur.
- Cache key varsayilan olarak `locale|fallbackLocale` uzerinden hesaplanir.
