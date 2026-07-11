import { json, type RequestHandler } from '@sveltejs/kit'
import { getDbAdminStatus } from '$lib/server/db-admin/service'
import { okResult } from '$lib/server/xf-result'

export const GET: RequestHandler = async () => json(okResult(await getDbAdminStatus()), { status: 200 })
