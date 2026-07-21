import { spawn } from 'node:child_process'

export type ExternalOpenInvocation = Readonly<{
  command: string
  args: string[]
}>

function assertLocalHttpUrl(value: string): string {
  const parsed = new URL(value)
  const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]'])
  if (!['http:', 'https:'].includes(parsed.protocol) ||
      !localHosts.has(parsed.hostname) ||
      parsed.username || parsed.password) {
    throw new Error('aops_external_url_refused:only_loopback_http_urls_are_allowed')
  }
  return parsed.href
}

export function resolveExternalOpenInvocation(
  value: string,
  platform: NodeJS.Platform = process.platform,
): ExternalOpenInvocation {
  const url = assertLocalHttpUrl(value)
  if (platform === 'win32') return { command: 'explorer.exe', args: [url] }
  if (platform === 'darwin') return { command: 'open', args: [url] }
  return { command: 'xdg-open', args: [url] }
}

export async function openExternalUrl(value: string): Promise<void> {
  const invocation = resolveExternalOpenInvocation(value)
  const child = spawn(invocation.command, invocation.args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve)
    child.once('error', reject)
  })
  child.unref()
}
