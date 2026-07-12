# Projectman Kanban + Sprint System (projectman-dm)

Bu dokuman, projectman-dm icindeki Kanban ve Sprint modelini, veri semasini, iliskileri ve calisma akisini aciklar.
Hedef: Hem insan PM/PO kullanimina uygun, hem de AI agent tooling ile otomasyon icin net bir temel saglamak.

Delivery policy, zorunlu artifact secimi, board strategy ve short/mid/long
horizon planning yontemi repository-level planning guidance tarafinda yonetilir.

## Genel Ozet
- Kanban: Project-scope zorunludur. Her proje birden fazla Kanban board (tahta grubu) barindirabilir.
- Kanban Column: Board-owned kolon kaydidir; her board kendi `Todo/Doing/Done` benzeri kolonlarini ayri kayitlar olarak tasir. `slug` tipik olarak `board-slug + column-slug` formatindadir.
- Kanban Task: Bir board + board column icinde yer alir. Sprint'e baglanabilir.
- Kanban Task Progress: Kanban task icindeki micro task item tamamlama oranindan otomatik hesaplanir (0-100).
- Sprint: Project-scope zorunludur. Sprint Group ve Micro Task Item ile detaylanir.
- Micro Task Item: Sprint planinin en kucuk birimidir. Kanban task ile veya sprint group ile iliskilendirilebilir.
- Issue Item: Sorun/engel/kayit birimidir. Proje-scope zorunludur; sprint/kanban/micro-task referanslari opsiyoneldir.
- Sprint-Kanban Link: Kanban task birden fazla sprint'e baglanabilir (N:N iliski tablosu).
- Kanban Template: Board + column preset tanimlar, tek seferde projeye klonlanir.
- Event Log: Task move/reorder/sprint baglama gibi hareketleri projectman-events tablosuna yazar.

## Terminoloji
- Board Group: Ayni proje icindeki farkli tahtalar (Daily, Backend, UI gibi).
- Column: Bir board'a ait kolon tanimi (Backlog / Todo / Doing / Done veya domain-ozel kolonlar). `slug` board bazli tekil anahtardir.
- Board Column: Bir board icinde bir column kullanimini ifade eder.
- Kanban Task: Is/istek karti. Kanban tarafinin ana is birimi.
- Kanban Task Progress: Task icindeki micro task item tamamlanma yuzdesi.
- Sprint: Zaman kutusu (iteration).
- Sprint Group: Sprint icinde faz/grup (Phase A, Phase B gibi).
- Micro Task Item: En kucuk aksiyon (checklist maddesi gibi).
- Issue Item: Agent veya insan tarafindan acilan sorun kaydi (bug/blocker/not).
- Sprint-Kanban Link: Sprint ile Kanban Task arasindaki N:N baglanti kaydi.
- Kanban Template: Board/column seed seti.
- Event Log: Sistem hareketlerinin audit kaydi.

## Veri Semasi (Drizzle / Postgres)

### Kanban
- kanban-boards
  - projectId zorunlu (global scope yok)
  - position + name uniqueness: project+scope icinde tekillik
- kanban-columns
  - column tanimi board-owned olarak kullanilir
  - `slug` unique: (tenantId, scopeId, slug)
- kanban-board-columns
  - boardId + columnId ile board icinde kolon
  - position unique: (tenantId, boardId, position)
- kanban-tasks
  - boardId + boardColumnId zorunlu
  - sprintId opsiyonel (kanban->sprint baglantisi)
  - progress (0-100) micro task item tamamlanma oranindan otomatik hesaplanir
  - position unique: (tenantId, boardColumnId, position)
- projectman-sprint-kanban-tasks
  - sprintId + kanbanTaskId unique
  - sprint <-> kanban task N:N baglantisi
- projectman-kanban-templates
  - scopeId + name unique
  - definition alaninda board + column preset tutulur
- projectman-events
  - event log / history kayitlari
  - action + entityType + entityId uzerinden filtrelenebilir

### Sprint
- projectman-sprints
  - projectId zorunlu (aopsv2 sprint tablosu ile collision olmamasi icin prefiksli)
  - status: domain/types.ts icindeki SPRINT_STATUSES
- projectman-sprint-groups
  - sprintId zorunlu
  - position unique: (tenantId, sprintId, position)
- micro-task-items
  - projectId zorunlu
  - sprintId / sprintGroupId / kanbanTaskId opsiyonel
  - status: domain/types.ts icindeki MICROTASK_STATUSES
  - position unique: (tenantId, sprintGroupId, position)
- issue-items
  - projectId zorunlu
  - sprintId / kanbanTaskId / microTaskItemId opsiyonel
  - status: domain/types.ts icindeki ISSUE_STATUSES
  - severity: domain/types.ts icindeki ISSUE_SEVERITIES
  - source: domain/types.ts icindeki ISSUE_SOURCES (human/agent/automation)

## Iliskiler
- Board Group -> Board Column (1-N)
- Board Column -> Kanban Task (1-N)
- Kanban Task -> Sprint (N-1, opsiyonel/legacy)
- Sprint <-> Kanban Task (N-N, projectman-sprint-kanban-tasks)
- Sprint -> Sprint Group (1-N)
- Sprint Group -> Micro Task Item (1-N)
- Micro Task Item -> Kanban Task (N-1, opsiyonel)
- Issue Item -> Sprint/Kanban Task/Micro Task Item (N-1, opsiyonel baglantilar)

Not: Kanban Task ile Micro Task Item ayni sey degil. Kanban Task istek/plan bazli, Micro Task Item ise aksiyon bazli en kucuk is birimi.

## Servis Katmani (Temel Methodlar)

### Kanban
- KanbanBoardService
  - createBoard / listBoards / updateBoard
- KanbanColumnService
  - createColumn / listColumns / updateColumn
- KanbanBoardColumnService
  - addColumnToBoard / listBoardColumns / updateBoardColumn / reorderBoardColumns
- KanbanTaskService
  - createTask (position otomatik)
  - listTasks (default sort: position asc)
  - updateTask
  - moveTaskToColumn (column degistirebilir)
  - reorderTasksInColumn (temp position ile stabil reorder)

### Sprint
- SprintService
  - createSprint / listSprints / updateSprint
- SprintGroupService
  - addGroup / listGroups / updateGroup / reorderGroups
- MicroTaskItemService
  - createMicroTask (position otomatik)
  - listMicroTasks (default sort: position asc)
  - updateMicroTask
  - reorderMicroTasksInGroup
- IssueItemService
  - createIssue (status/severity/source default + openedAt auto)
  - listIssues (default sort: createdAt desc)
  - updateIssue
  - removeIssue
- SprintKanbanTaskLinkService
  - linkTaskToSprint / unlinkTaskFromSprint
  - listLinks
- KanbanTemplateService
  - createTemplate / listTemplates / updateTemplate
  - applyTemplateToProject (bulk clone)
- ProjectmanEventService
  - createEvent / listEvents

## Kanban -> Sprint Baglantisi (Onerilen Akis)
1) Kanban tarafinda Task olusur (istek/backlog).
2) Detayli plan gerekiyorsa Sprint olusturulur.
3) Sprint icinde Sprint Group + Micro Task Item tanimlanir.
4) Micro Task Item'lar opsiyonel olarak Kanban Task'a baglanir.
5) Kanban Task uzerinde sprintId alanina Sprint baglanir (tek sprint).
6) Birden fazla sprint gerekiyorsa projectman-sprint-kanban-tasks ile N:N baglanti kullanilir.

Bu model hem sprintli hem sprint'siz ilerlemeye izin verir:
- Basit isler: Sadece Kanban Task + Micro Task (sprint bagimsiz)
- Planli isler: Kanban Task -> Sprint -> Phase -> Micro Task

## Uygulama Kurallari (Pratik)
- Project-scope zorunlu: Kanban ve Sprint global degil, proje ile bagli.
- Position otomatik: position verilmezse son siradan ekler.
- Reorder: iki fazli temp+final update kullanir (index cakislarini engeller).
- Reuse: Ayni isimli kolonlar farkli boardlarda farkli kayitlar olarak yaratilir; board bootstrap ve template apply akislari kolon slug'ini `board-slug + column-slug` uzerinden netlestirir.
- Progress sync: MicroTaskItem status degisince ilgili Kanban Task progress otomatik guncellenir.
- Event log: move/reorder/sprint link islemlerinde projectman-events kaydi olusur.
- Template apply: Bir template birden fazla board + column'u tek seferde projeye kopyalar.
- N:N link: Kanban Task birden fazla Sprint ile baglanabilir (projectman-sprint-kanban-tasks).

## Event ve Memory Pattern

Projectman artik curated timeline truth'unu legacy timeline item capability'si ile tasimaz.

Kural:

1. `projectman-events` ham audit izidir
2. `history` yalnizca legacy timeline konteyneri olarak kalir; yeni akislara owner olmaz
3. `agentspace memory-item` durable resume, decision ve closeout truth'unu tasir

### Onerilen kullanim

1. board, task, sprint, phase ve microtask execution truth'unu tasir
2. milestone / closeout / carry-forward anlatimi `agentspace.memory-item` ile yazilir
3. event log degisiklik akisini korur, memory ise baska bir agent'in guvenli resume etmesini saglar

### Backfill notu

Execution timeline sonradan da backfill edilebilir:

1. sprint listesi
2. kanban task ve microtask baglantilari
3. issue/feedback kayitlari
4. projectman-events audit izi
5. agentspace memory-item closeout kayitlari

## Otomatik Senkron (Kanban Task Progress)
- MicroTaskItemService.createMicroTask/updateMicroTask icinde kanbanTaskId varsa, kanban task progress yeniden hesaplanir.
- Oran: completed / total * 100 (total=0 ise 0).

## Event Log / History
- kayitlar projectman-events tablosunda tutulur.
- kanban task icin loglanan aksiyonlar:
  - kanban.task.move
  - kanban.task.reorder
  - kanban.task.link-sprint / kanban.task.unlink-sprint
- Log payload icinde from/to bilgileri ve ordered id listesi bulunur.

Onemli ayrim:

1. `projectman-events` = ham degisiklik izi
2. `agentspace memory-item` = durable context / handoff / lesson

## Template / Seed (Bulk Clone)
- Kanban template definition board + column presetlerini tutar.
- applyTemplateToProject(templateId, projectId) tum boardlari tek seferde olusturur.
- Column tanimlari board-owned oldugu icin template apply her board icin o boarda ait kolon kayitlari olusturur.

Ornek template tanimi:
```json
{
  "boards": [
        {
          "name": "General",
          "columns": [
        { "name": "Todo", "slug": "todo" },
        { "name": "Doing", "slug": "doing" },
        { "name": "Done", "slug": "done" }
      ]
    }
  ]
}
```

## Tooling (AOPS Server)
- Pattern bozulmadan host/plugin tabanli `/api/agent/tools/*` altyapisi kullanilir.
- Tool group: `projectman`
- **API + CLI**: tool cagirilari `/api/agent/tools/<toolId>/invoke` veya `projectman call ...` ile yapilir.
- Tum islemler project-scope'tur; `project` zorunlu/onerilir.

Ornek (curl):
```bash
# Board list
curl -sS -X POST "$AOPS_API_BASE_URL/api/agent/tools/projectman-kanban-board-list/invoke" \\
  -H "Authorization: Bearer $AOPS_API_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{\"input\":{\"project\":\"<projectId>\"}}'

# Task create
curl -sS -X POST "$AOPS_API_BASE_URL/api/agent/tools/projectman-kanban-task-create/invoke" \\
  -H "Authorization: Bearer $AOPS_API_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{\"input\":{\"project\":\"<projectId>\",\"board\":\"<id>\",\"boardColumn\":\"<id>\",\"title\":\"Draft UI\"}}'
```

Not:
- Lokal helper CLI: `nx run projectman-cli:start -- tools` (API wrapper degil).

## AI Agent Tooling Icın Pratik Akislar
- Backlog ingestion:
  - KanbanTaskService.createTask -> auto position
  - Opsiyonel etiketleme (ileride meta alan eklenebilir)
- Sprint planlama:
  - SprintService.createSprint
  - SprintGroupService.addGroup
  - MicroTaskItemService.createMicroTask (kanbanTaskId ile baglama)
- Issue kaydi:
  - IssueItemService.createIssue (agent/human source + optional referanslar)
  - IssueItemService.updateIssue (resolved/closed akisi)
- Durum raporu:
  - KanbanTask.progress zaten guncel; gerekirse MicroTask list ile detay raporla
  - Sprint status + micro task status dagilimi
- Audit / otomasyon:
  - projectman-events tablosu uzerinden degisiklik history + agent audit

## Geliştirme/Genisletme Fikirleri
- WIP limitleri enforcement (board column bazli)
- Slug standardizasyonu (kanban columns + micro tasks)
- Sprint summary/metrics (velocity, cycle time, carry-over)
- Micro Task item icin dependency grafi
- Access control (project member role bazli CRUD)
- AI agent icin policy layer: auto-assign, auto-split, auto-schedule
- API/Tooling: sprint/kanban baglantisi icin bulk operations

## Notlar
- projectman-sprints tablolari aopsv2 sprints ile carpismaz.
- Kanban Task ile Sprint Item birlestirildi; SprintItem yerine Micro Task Item kullanilir.
- Kanban Task -> Sprint baglantisi opsiyonel; sistem sprint olmadan da kullanilabilir.
- Coklu sprint baglantisi gerekiyorsa sprint-kanban link tablosu kullanilir.
