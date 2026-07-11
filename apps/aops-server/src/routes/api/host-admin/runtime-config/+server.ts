import { json, type RequestHandler } from '@sveltejs/kit'
import { readRuntimeConfigAdmin } from '$lib/server/aops-runtime-config'
import { okResult } from '$lib/server/xf-result'

export const GET: RequestHandler = async () => json(okResult(readRuntimeConfigAdmin()), { status: 200 })
