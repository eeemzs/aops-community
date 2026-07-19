import crypto from 'node:crypto'
import fs from 'node:fs'

declare const __AOPS_AGENT_ASSETS_GATEWAY_TEXT__: string | undefined

export const AOPS_AGENT_ASSETS_GATEWAY_RELATIVE_PATH = 'skills/aops/SKILL.md'

/**
 * Stable runtime gateway. It contains no package, repository, server, or local
 * store path, so activation/update/rollback never need to rewrite it.
 */
const BUNDLED_GATEWAY = typeof __AOPS_AGENT_ASSETS_GATEWAY_TEXT__ === 'undefined'
  ? undefined
  : __AOPS_AGENT_ASSETS_GATEWAY_TEXT__

export const AOPS_AGENT_ASSETS_GATEWAY_SOURCE_URL = BUNDLED_GATEWAY === undefined
  ? new URL('../../../assets/agent-assets/gateway/aops/SKILL.md', import.meta.url)
  : undefined

export const AOPS_AGENT_ASSETS_GATEWAY = BUNDLED_GATEWAY
  ?? fs.readFileSync(AOPS_AGENT_ASSETS_GATEWAY_SOURCE_URL!, 'utf8')

export const AOPS_AGENT_ASSETS_GATEWAY_SHA256 = crypto
  .createHash('sha256')
  .update(AOPS_AGENT_ASSETS_GATEWAY, 'utf8')
  .digest('hex')
