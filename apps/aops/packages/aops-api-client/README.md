# @aopslab/api-client

Shared HTTP client for `aops-server` API (used by `aops-cli` + `aops-mcp`).

## What it provides
- `joinUrl(baseUrl, path)` + `resolveApiBaseUrl(input?)`
- `requestXfJson` / `postXfJson` (XfResult parsing + timeout)
- `createAopsApiClient(...)` (Bearer auth header + optional refresh-on-401)

## Example
```ts
import { createAopsApiClient } from '@aopslab/api-client'

const api = createAopsApiClient({
  baseUrl: 'http://localhost:5900',
  getAccessToken: () => process.env.AOPS_API_ACCESS_TOKEN,
  getRefreshToken: () => process.env.AOPS_API_REFRESH_TOKEN,
  onTokenRefresh: async (tokens) => {
    // persist tokens (config file, vault, etc)
    console.log('refreshed', tokens.userId)
  },
})

const tooling = await api.fetchJson('/api/agent/tools')
console.log(tooling)
```
