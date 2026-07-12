const DOMAIN_PREFIX = 'sys'

function normalizeToken(value: string): string {
  return String(value ?? '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function pluralizeToken(token: string): string {
  if (!token) return token
  if (token.endsWith('s')) return token
  if (token.endsWith('y') && !/[aeiou]y$/.test(token)) return token.slice(0, -1) + 'ies'
  if (/(x|z|ch|sh)$/.test(token)) return token + 'es'
  return token + 's'
}

const DOMAIN_TOKEN = normalizeToken(DOMAIN_PREFIX)
const DOMAIN_BASE_TOKEN = normalizeToken(DOMAIN_PREFIX.replace(/([_-]?v)?[0-9]+$/gi, ''))

function stripDomainPrefix(localToken: string): string {
  let local = localToken

  const strip = (prefix: string) => {
    if (!prefix) return
    if (local.startsWith(prefix + '_')) {
      local = local.slice(prefix.length + 1)
    }
  }

  strip(DOMAIN_TOKEN)
  if (DOMAIN_BASE_TOKEN !== DOMAIN_TOKEN) strip(DOMAIN_BASE_TOKEN)

  return local || localToken
}

function buildDomainScopedName(
  name: string,
  options: { pluralize?: boolean; stripDbPrefix?: boolean },
): string {
  let local = normalizeToken(name)
  if (!local) throw new Error('invalid_name_for_domain_scoping')

  if (options.stripDbPrefix !== false && local.startsWith('db_')) {
    local = local.slice(3)
  }

  if (options.pluralize === true) {
    local = pluralizeToken(local)
  }

  local = stripDomainPrefix(local)
  return DOMAIN_TOKEN + '_' + local
}

export function domainTableName(name: string): string {
  return buildDomainScopedName(name, { pluralize: false, stripDbPrefix: false })
}

export function domainCollectionName(name: string): string {
  return buildDomainScopedName(name, { pluralize: true, stripDbPrefix: true })
}
