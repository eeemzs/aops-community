# Projectman CLI (Helper + Wrapper)

Projectman CLI is a **local helper + AOPS wrapper** (`projectman-cli`).
Tooling cagirilari API veya CLI uzerinden yapilir.

## Usage (standalone)
```bash
# tools list
nx run projectman-cli:start -- tools
```

## API usage
```bash
curl -sS -X POST "$AOPS_API_BASE_URL/api/agent/tools/projectman-kanban-board-list/invoke" \
  -H "Authorization: Bearer $AOPS_API_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"input":{"project":"<projectId>"}}'
```

## CLI wrapper usage
```bash
nx run projectman-cli:start -- call kanban board list --input '{"project":"<projectId>"}' --mode aops
```

## CLI local usage
```bash
nx run projectman-cli:start -- call kanban board list --input '{"project":"<projectId>"}' --mode local
```

Tool id helper:
- `projectman tool-id kanban board list` → `projectman-kanban-board-list`

## Examples
```bash
# Tool ids
nx run projectman-cli:start -- tools

# Build tool id
nx run projectman-cli:start -- tool-id kanban task create
# Call tooling (local or AOPS)
nx run projectman-cli:start -- call kanban task create --input '{"project":"<projectId>"}' --mode local
nx run projectman-cli:start -- call kanban task create --input '{"project":"<projectId>"}' --mode aops
nx run projectman-cli:start -- call issue create --input '{"project":"<projectId>","title":"Agent issue","source":"agent","severity":"high"}' --mode aops
```
