import { errResult, type XfResult } from '$lib/server/xf-result'

type LocalsLike = { principal?: { userId?: string } | null }

export function ensureAuthenticated(locals: LocalsLike): XfResult<null> | null {
  return locals.principal ? null : errResult('unauthorized')
}

export function ensureDbMutationAccess(_locals: LocalsLike): XfResult<null> {
  return errResult('community_db_mutation_disabled')
}

export function mapDbAdminError(error: unknown, fallbackCode: string): { status: number; result: XfResult<null> } {
  const message = error instanceof Error ? error.message : "unknown_error"
  if (message === 'aops_pg_url_required') return { status: 503, result: errResult(message) }
  return { status: 500, result: errResult(fallbackCode) }
}
