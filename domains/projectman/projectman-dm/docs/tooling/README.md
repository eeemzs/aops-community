# Projectman Tooling (AOPS + Local)

Projectman Kanban + Sprint operations are exposed through AOPS agent gateway + local runner.
Tool group id: `projectman`.

## Tooling Surface
- Tool list: `GET /api/agent/tools?domain=projectman`
- Tool call: `POST /api/agent/tools/<toolId>/invoke`

API + CLI (tool call) ornegi:
```bash
curl -sS -X POST "$AOPS_API_BASE_URL/api/agent/tools/projectman-kanban-task-create/invoke" \
  -H "Authorization: Bearer $AOPS_API_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"input":{"project":"<projectId>","board":"<id>","boardColumn":"<id>","title":"Draft UI"}}'

# CLI (local)
projectman call kanban task create --input '{"project":"<projectId>","board":"<id>","boardColumn":"<id>","title":"Draft UI"}' --mode local

# CLI (AOPS)
projectman call kanban task create --input '{"project":"<projectId>","board":"<id>","boardColumn":"<id>","title":"Draft UI"}' --mode aops
```

## Scope
- Projectman tooling is **project-scope**.
- Most commands require `--project <projectId>`.
- Scope is resolved from `projectId` / `scopeId`, and in this model both point to the active project.

## Notes
- Tool metadata (options, flags, enums) source of truth:
  - `projectman-tooling/src/specs.ts`
- Toolpack resources:
  - `projectman-core/resources/**`
- AOPS server tarafinda statik legacy tooling handler yoktur.
- Domain tool katalogu `/api/agent/tools` projection'u ile kullanilir.

## Quick Examples
```bash
# Board list
curl -sS -X POST "$AOPS_API_BASE_URL/api/agent/tools/projectman-kanban-board-list/invoke" \
  -H "Authorization: Bearer $AOPS_API_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"input":{"project":"<projectId>"}}'

# Sprint link
curl -sS -X POST "$AOPS_API_BASE_URL/api/agent/tools/projectman-sprint-kanban-link/invoke" \
  -H "Authorization: Bearer $AOPS_API_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"input":{"project":"<projectId>","sprint":"<sprintId>","kanbanTask":"<taskId>"}}'

# Issue create (agent kaynakli)
curl -sS -X POST "$AOPS_API_BASE_URL/api/agent/tools/projectman-issue-create/invoke" \
  -H "Authorization: Bearer $AOPS_API_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"input":{"project":"<projectId>","title":"Sync timeout on branch scan","source":"agent","severity":"high","kanbanTask":"<taskId>"}}'
```
