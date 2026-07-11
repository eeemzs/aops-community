import { json, type RequestHandler } from '@sveltejs/kit'
import { testRuntimeConfigAdminTarget } from '$lib/server/aops-runtime-config'
import { errResult, okResult } from '$lib/server/xf-result'

export const POST: RequestHandler = async () => {
  try {
    return json(okResult(await testRuntimeConfigAdminTarget()), { status: 200 })
  } catch (error) {
    const code = error instanceof Error && error.message === 'aops_pg_url_required' ? error.message : 'runtime_config_test_failed'
    return json(errResult(code), { status: code === 'aops_pg_url_required' ? 503 : 500 })
  }
}
