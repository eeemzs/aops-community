# aops-kit

aops-kit kiti, domain servis ve repository'lerini hexagonal prensiplerle uygulamalara baglayan ince bir kopru saglar.
Bu scaffold, `inventory-kit` desenini takip eder ve domain'e ozel kodlari
`//==> custom ... <==//` bloklarinda izole eder.

## Hizli Kullanim (env ile)

```ts
import { createAgentspaceKitWithEnv, getAgentspaceKitEnvConfig } from '@aops/aops-kit'

const { kit } = createAgentspaceKitWithEnv({
  envConfig: getAgentspaceKitEnvConfig(),
  baseContext: {
    tenantId: 'tenant-1',
    locale: 'tr',
    fallbackLocale: 'en',
    logger,
  },
})

const service = await kit.getProjectService()
```

## Env Degiskenleri

- `TENANT_ID`
- `LOG_LEVEL`
- `AGENTSPACE_REPO_URL` (ortak repo URL; pg/sqlite)
- `AGENTSPACE_SQLITE_URL` (sqlite repo URL)
- `AGENTSPACE_PG_URL` (postgres repo URL)
- `AOPS_PG_URL` (geriye donuk ortak fallback)

## Sundugu Yuzey

Services:
- `projectService`
- `promptService`
- `promptVersionService`
- `resourceService`
- `skillService`
- `skillVersionService`
- `kanbanBoardService`
- `kanbanColumnService`
- `sprintService`
- `sprintItemService`
- `taskService`
- `taskCommentService`
- `agentSessionService`
- `agentRunService`
- `artifactService`
- `artifactLinkService`
- `memoryItemService`

Repositories:
- `projectRepository`
- `promptRepository`
- `promptVersionRepository`
- `resourceRepository`
- `skillRepository`
- `skillVersionRepository`
- `kanbanBoardRepository`
- `kanbanColumnRepository`
- `sprintRepository`
- `sprintItemRepository`
- `taskRepository`
- `taskCommentRepository`
- `agentSessionRepository`
- `agentRunRepository`
- `artifactRepository`
- `artifactLinkRepository`
- `memoryItemRepository`

## Notlar

- `tenantId` context icinde zorunludur.
- Cache key varsayilan olarak `locale|fallbackLocale` uzerinden hesaplanir.
