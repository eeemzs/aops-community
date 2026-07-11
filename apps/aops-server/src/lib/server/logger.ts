import type { XfLogger } from '@aopslab/xf-logger'

type LoggerOptions = {
  level?: 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  file?: boolean
  console?: boolean
}

export async function getLogger(opts: LoggerOptions = {}): Promise<XfLogger | undefined> {
  const { level = 'info', file = false, console = true } = opts
  const mod = await import('@aopslab/xf-logger')
  return await mod.createLogger({
    level,
    runtime: 'nodejs',
    printServerConsole: !!console,
    printFile: file,
    fileType: 'txt',
    splitErrorWarn: true,
    prettyConsole: true,
    path: './logs/aops-server',
    base: { module: 'AOPS-API' },
  })
}
