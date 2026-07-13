export const COMMUNITY_COMMAND_ABORT_MESSAGE = 'community_operation_aborted'

export class CommunityCommandAbortedError extends Error {
  readonly code = 'COMMUNITY_OPERATION_ABORTED'

  constructor() {
    super(COMMUNITY_COMMAND_ABORT_MESSAGE)
    this.name = 'CommunityCommandAbortedError'
  }
}

export type CommunityCommandSignal = 'SIGINT' | 'SIGTERM'

export type CommunityCommandAbortRuntime = Readonly<{
  createController: () => AbortController
  addSignalListener: (signal: CommunityCommandSignal, listener: () => void) => void
  removeSignalListener: (signal: CommunityCommandSignal, listener: () => void) => void
}>

export const communityCommandAbortRuntime: CommunityCommandAbortRuntime = Object.freeze({
  createController: () => new AbortController(),
  addSignalListener: (signal, listener) => process.on(signal, listener),
  removeSignalListener: (signal, listener) => process.off(signal, listener),
})

export function throwIfCommunityCommandAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new CommunityCommandAbortedError()
}

export async function withCommunityCommandAbortScope<T>(
  runtime: CommunityCommandAbortRuntime,
  callback: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = runtime.createController()
  const registrations: CommunityCommandSignal[] = []
  const abort = () => {
    if (!controller.signal.aborted) controller.abort(new CommunityCommandAbortedError())
  }
  let failed = false
  let failure: unknown
  let result: T | undefined
  try {
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      // Record the attempt first: a custom runtime can throw after installing
      // the listener, and cleanup must still try to remove that listener.
      registrations.push(signal)
      runtime.addSignalListener(signal, abort)
    }
    throwIfCommunityCommandAborted(controller.signal)
    result = await callback(controller.signal)
    throwIfCommunityCommandAborted(controller.signal)
  } catch (error) {
    failed = true
    failure = error
  }

  let cleanupFailed = false
  let cleanupFailure: unknown
  for (const signal of registrations) {
    try {
      runtime.removeSignalListener(signal, abort)
    } catch (error) {
      if (!cleanupFailed) {
        cleanupFailed = true
        cleanupFailure = error
      }
    }
  }

  // Cleanup failures must never replace the command/registration failure.
  if (failed) throw failure
  if (cleanupFailed) throw cleanupFailure
  return result as T
}
