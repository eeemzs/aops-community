export type RefreshRaceTokens = { accessToken: string; refreshToken: string; userId?: string }

export interface RefreshRaceRecoveryOptions {
  /** Current refresh token (the one whose refresh just lost the race). */
  getCurrentRefreshToken: () => string | undefined
  /** Re-read the shared token store (e.g. the CLI config file); returns the latest tokens or null. */
  readLatestTokens: () => Promise<RefreshRaceTokens | null> | RefreshRaceTokens | null
  /** Adopt recovered tokens into the in-memory client state. */
  applyTokens: (tokens: RefreshRaceTokens) => void
  /** Max poll attempts (default 5). */
  maxAttempts?: number
  /** Base delay (ms) between attempts; grows linearly per attempt (default 50). */
  delayMs?: number
  /** Injectable sleep (tests pass a no-op). */
  sleep?: (ms: number) => Promise<void>
}

/**
 * Build an `onRefreshRace` handler for the AOPS API client.
 *
 * When the server reports a benign concurrent refresh race (HTTP 409
 * `refresh_race_detected`), another client process has already rotated the
 * refresh token and written the new pair to the shared store (the CLI config
 * file). Multiple headless/automation CLI processes that share one config are the
 * real cutover risk: the in-flight single-flight dedupe is process-local, so the
 * loser must recover from the shared store instead of failing.
 *
 * This recovery re-reads the shared store (polling briefly so the winner's write
 * lands), adopts the rotated token when it differs from the current one, and
 * signals recovery so the original request is retried with the fresh access
 * token. Returns false when no newer token appears (genuine failure), so the
 * caller surfaces a normal auth error instead of looping.
 */
export function createRefreshRaceRecovery(options: RefreshRaceRecoveryOptions): () => Promise<boolean> {
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 5))
  const baseDelay = Math.max(0, Math.floor(options.delayMs ?? 50))
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))

  return async (): Promise<boolean> => {
    const previousRefresh = options.getCurrentRefreshToken()

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let latest: RefreshRaceTokens | null = null
      try {
        latest = await options.readLatestTokens()
      } catch {
        latest = null
      }

      if (
        latest &&
        latest.accessToken &&
        latest.refreshToken &&
        latest.refreshToken !== previousRefresh
      ) {
        options.applyTokens(latest)
        return true
      }

      if (attempt < maxAttempts - 1 && baseDelay > 0) {
        await sleep(baseDelay * (attempt + 1))
      }
    }

    return false
  }
}
