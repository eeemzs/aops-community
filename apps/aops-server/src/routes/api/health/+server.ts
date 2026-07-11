import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { readBootstrapHealth } from '$lib/server/bootstrap-health'
import { okResult } from '$lib/server/xf-result'

export const GET: RequestHandler = async () => {
  return json(
    okResult({
      status: 'ok',
      service: 'aops-server',
      bootstrap: await readBootstrapHealth(),
    }),
  )
}
