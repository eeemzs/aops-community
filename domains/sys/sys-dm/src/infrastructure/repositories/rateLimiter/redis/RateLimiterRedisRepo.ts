import { failureLegacy as failure, successLegacy as success, XfResultLegacy as XfResult, filterException } from '@aopslab/xf-core';
import { XfLogger } from '@aopslab/xf-logger';
import { RedisAdapterBase, RedisAdapterConfig, RedisConnection } from '@aopslab/xf-db-redis';
import { Effect } from 'effect'

// Domain imports
import { IbmRateLimiter } from '../../../../domain/models/index.js';

// Application layer imports
import { IRepositoryPortRateLimiter } from '../../../../application/ports/repository-ports/IRepositoryPortRateLimiter.js';
import { RateLimiterResult, RateLimitRule } from '../../../../application/ports/types.js';
import { ErrorDomainSys } from '../../../../domain/domain.js';

// Common utilities
import {
  RateLimiterCommonError,
  rateLimiterRepoCommonCheckRateLimiter,
  rateLimiterRepoCommonCleanRateLimiter,
  rateLimiterRepoCommonCleanupAll,
  RateLimitDeleteManyAdapter
} from '../rateLimiter.common.js';

/**
 * Rate Limiter-specific Lua Scripts for RaRateLimiter
 *
 * Key Improvements:
 * - Fixed-window approach: TTL only set on creation, reset, or blocking
 * - Blocked users don't increment attempt counter
 * - Atomic operations ensure thread-safety
 * - EVALSHA optimization for better performance
 */
const RATE_LIMITER_LUA_SCRIPTS = {
  // Atomic new attempt with rate limiting logic
  NEW_ATTEMPT: `
    local key = KEYS[1]
    local nowMs = tonumber(ARGV[1])
    local maxAttempts = tonumber(ARGV[2])
    local blockDurationSeconds = tonumber(ARGV[3])
    local ttlSeconds = tonumber(ARGV[4])
    local keyValue = ARGV[5]
    local scopeValue = ARGV[6]
    local backoffMultiplier = tonumber(ARGV[7]) or 1
    local maxBlockDurationSeconds = tonumber(ARGV[8]) or blockDurationSeconds

    if backoffMultiplier < 1 then
      backoffMultiplier = 1
    end

    if maxBlockDurationSeconds < 1 then
      maxBlockDurationSeconds = blockDurationSeconds
    end

    local function isPresent(value)
      return value ~= nil and value ~= cjson.null
    end

    local function normalizeStreak(value)
      local parsed = tonumber(value)
      if parsed == nil or parsed < 1 then
        return 0
      end
      return math.floor(parsed)
    end

    local function calculateBlockDurationSeconds(violationStreak)
      if backoffMultiplier <= 1 then
        return blockDurationSeconds
      end
      local exponent = math.max(0, violationStreak - 1)
      local escalated = math.ceil(blockDurationSeconds * (backoffMultiplier ^ exponent))
      return math.min(escalated, maxBlockDurationSeconds)
    end

    -- Get existing rate limiter
    local existing = redis.call('GET', key)
    local rateLimiter
    local shouldSetTtl = false

    if not existing then
      -- Create new rate limiter
      rateLimiter = {
        key = keyValue,
        scope = scopeValue,
        attempts = 1,
        windowStart = nowMs,
        resetAt = nowMs + (blockDurationSeconds * 1000),
        blockedAt = cjson.null,
        violationStreak = 0,
        lastViolationAt = cjson.null
      }
      shouldSetTtl = true -- Set TTL only on first creation
    else
      rateLimiter = cjson.decode(existing)

      -- Check if reset time has passed
      if rateLimiter.resetAt and rateLimiter.resetAt < nowMs then
        local previousWindowWasBlocked = isPresent(rateLimiter.blockedAt)
        -- Reset the attempt window; keep streak only for the first clean window after a block.
        rateLimiter.attempts = 1
        rateLimiter.windowStart = nowMs
        rateLimiter.resetAt = nowMs + (blockDurationSeconds * 1000)
        rateLimiter.blockedAt = cjson.null
        if previousWindowWasBlocked then
          rateLimiter.violationStreak = normalizeStreak(rateLimiter.violationStreak)
        else
          rateLimiter.violationStreak = 0
          rateLimiter.lastViolationAt = cjson.null
        end
        shouldSetTtl = true -- Reset TTL on window reset
      else
        -- Check if already blocked - don't increment if blocked
        if not isPresent(rateLimiter.blockedAt) then
          rateLimiter.attempts = rateLimiter.attempts + 1
        else
          -- Already blocked, don't increment attempts
          -- Just return current state
          return cjson.encode(rateLimiter)
        end
      end
    end

    -- Check if max attempts exceeded (only if not already blocked)
    if not isPresent(rateLimiter.blockedAt) and rateLimiter.attempts > maxAttempts then
      local nextViolationStreak = normalizeStreak(rateLimiter.violationStreak) + 1
      local currentBlockDurationSeconds = calculateBlockDurationSeconds(nextViolationStreak)
      rateLimiter.attempts = maxAttempts  -- Cap attempts at maxAttempts
      rateLimiter.blockedAt = nowMs
      rateLimiter.resetAt = nowMs + (currentBlockDurationSeconds * 1000)
      rateLimiter.violationStreak = nextViolationStreak
      rateLimiter.lastViolationAt = nowMs
      shouldSetTtl = true -- Set TTL when blocking occurs
    end

    -- Save to Redis - preserve TTL unless we need to set it
    local payload = cjson.encode(rateLimiter)
    if shouldSetTtl then
      redis.call('SETEX', key, ttlSeconds, payload)
    else
      -- Preserve existing TTL when updating
      local ttl = redis.call('TTL', key)
      if ttl > 0 then
        redis.call('SETEX', key, ttl, payload)
      else
        -- Key has no TTL or doesn't exist, use ttlSeconds as fallback
        redis.call('SETEX', key, ttlSeconds, payload)
      end
    end



    return payload
  `
} as const;

export class RateLimiterRedisRepo extends RedisAdapterBase<IbmRateLimiter> implements IRepositoryPortRateLimiter {
  private readonly defaultTtl?: number;
  private scriptsInitialized = false;
  private scriptSHAs: Map<string, string> = new Map(); // Cache script SHAs for EVALSHA

  constructor(params: {
    redisConnection: RedisConnection;
    tenantId: string;
    redisAdapterConfig?: RedisAdapterConfig;
    logger?: XfLogger;
  }) {
    super({
      redisConnection: params.redisConnection,
      tenantId: params.tenantId,
      retryOptions: params.redisAdapterConfig?.commandRetryOptions,
      logger: params.logger
    });
    this.defaultTtl = params.redisAdapterConfig?.defaultTtl;
  }

  // Common adapters for standard operations
  private findSingleAdapter = async (key: string, scope: string): Promise<XfResult<IbmRateLimiter>> => {
    const cacheKey = this.makeKey(key, scope);
    const currentTime = new Date().getTime();

    try {
      const client = await this.getRedisClient();
      const data = await client.get(cacheKey);

      if (!data) {
        return failure({
          messageText: 'Rate limiter not found',
          opts: {
            domain: ErrorDomainSys.RateLimiter,
            stage: `${this.constructor.name}.findSingleAdapter`,
            debug: { key, scope }
          }
        });
      }

      const rateLimiterData = JSON.parse(data) as IbmRateLimiter;

      const hasBlockedAt = rateLimiterData.blockedAt !== null && rateLimiterData.blockedAt !== undefined;

      // Auto-cleanup expired clean windows, but keep an expired block so the next attempt can carry escalation streak.
      if (!hasBlockedAt && rateLimiterData.resetAt && new Date(rateLimiterData.resetAt).getTime() < currentTime) {
        await client.del(cacheKey);
        return failure({
          messageText: 'Rate limiter expired and cleaned up',
          opts: {
            domain: ErrorDomainSys.RateLimiter,
            stage: `${this.constructor.name}.findSingleAdapter`,
            debug: { key, scope }
          }
        });
      }

      return success(rateLimiterData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Exception in findSingleAdapter';
      return failure({
        messageText: `Failed to find rate limiter: ${errorMessage}`,
        opts: {
          domain: ErrorDomainSys.RateLimiter,
          stage: `${this.constructor.name}.findSingleAdapter`,
          exception: filterException(err)
        }
      });
    }
  };

  // Adapter for bulk operations
  private deleteManyAdapter: RateLimitDeleteManyAdapter = async (criteria: { key?: string; scope?: string }) => {
    try {
      const client = await this.getRedisClient();
      let deletedCount = 0;

      if (criteria.key && criteria.scope) {
        // Delete specific key-scope combination
        const cacheKey = this.makeKey(criteria.key, criteria.scope);
        const result = await client.del(cacheKey);
        deletedCount = result;
      } else {
        // Delete all rate limiters for this tenant
        const pattern = this.makePattern();
        let cursor = 0;

        do {
          const scanResult = await client.scan(cursor.toString(), {
            MATCH: pattern,
            COUNT: 1000
          });
          cursor = Number(scanResult.cursor);
          const keys = scanResult.keys;

          if (keys.length > 0) {
            const delResult = await client.unlink(keys);
            deletedCount += delResult;
          }
        } while (cursor !== 0);
      }

      return success(deletedCount);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Exception in deleteManyAdapter';
      return failure({
        messageText: `Failed to delete rate limiter records: ${errorMessage}`,
        opts: {
          domain: ErrorDomainSys.RateLimiter,
          stage: `${this.constructor.name}.deleteManyAdapter`,
          exception: filterException(err)
        }
      });
    }
  };

  /**
   * Lazy initialization of rate limiter-specific Lua scripts
   */
  private async ensureScriptsLoaded(): Promise<void> {
    if (this.scriptsInitialized) {
      return;
    }

    try {
      this.logger?.debug('Loading rate limiter-specific Lua scripts...');

      // Only load NEW_ATTEMPT script (the one that requires atomicity)
      const loadPromises = Object.entries(RATE_LIMITER_LUA_SCRIPTS).map(async ([name, script]) => {
        const namespacedKey = `${this.constructor.name}:${name}`;
        if (!this.redisConnection.isScriptLoaded(namespacedKey)) {
          const sha = await this.redisConnection.loadScript(name, script, this.constructor.name);
          this.scriptSHAs.set(name, sha); // Cache SHA for EVALSHA
          this.logger?.debug({ name, sha }, `Loaded rate limiter script`);
        } else {
          this.logger?.debug({ name }, `Rate limiter script already loaded`);
        }
        return name;
      });

      await Promise.all(loadPromises);
      this.scriptsInitialized = true;
      this.logger?.debug('Rate limiter Lua scripts initialized successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Exception in ensureScriptsLoaded';
      this.logger?.error({ errorMessage }, 'Failed to load rate limiter Lua scripts');
      throw error;
    }
  }

  /**
   * Validate key and scope parameters
   */
  private validateKeyScope(key: string, scope: string): XfResult<void> {
    if (!key || !scope || scope.length < 2 || key.length < 2) {
      return failure({
        messageText: 'Key and scope are required and must be at least 2 characters',
        opts: {
          domain: ErrorDomainSys.RateLimiter,
          stage: `${this.constructor.name}.validateKeyScope`,
          debug: { key, scope }
        }
      });
    }
    return success(undefined);
  }

  // removed old XfResult failure helper; errors now flow via Effect error channel

  /**
   * Execute rate limiter-specific Lua script with automatic initialization
   */
  private async executeRateLimiterScript(
    scriptName: keyof typeof RATE_LIMITER_LUA_SCRIPTS,
    keys: string[] = [],
    args: string[] = []
  ): Promise<any> {
    await this.ensureScriptsLoaded();

    try {
      // NOTE: EVALSHA optimization ready - SHA cached in this.scriptSHAs Map
      // RedisConnection.evalScript() can utilize SHA for EVALSHA if needed
      const namespacedScriptName = `${this.constructor.name}:${scriptName}`;
      return await this.redisConnection.evalScript(namespacedScriptName, keys, args, this.constructor.name);
    } catch (error) {
      // If script not found, try reloading and retry once
      if (
        error instanceof Error &&
        (error.message.includes('not found in Redis cache') ||
          error.message.includes('not loaded') ||
          error.message.includes('NOSCRIPT'))
      ) {
        this.logger?.warn({ scriptName }, `Reloading rate limiter script`);
        this.scriptsInitialized = false;
        await this.ensureScriptsLoaded();
        const namespacedScriptName = `${this.constructor.name}:${scriptName}`;
        return await this.redisConnection.evalScript(namespacedScriptName, keys, args, this.constructor.name);
      }
      throw error;
    }
  }

  /**
   * Generate Redis key for rate limiter
   * Format: rate_limiter:tenant:{tenantId}:scope:{scope}:key:{key}
   */
  private makeKey(key: string, scope: string): string {
    return `rate_limiter:tenant:${this.tenantId}:scope:${scope}:key:${key}`;
  }

  /**
   * Generate Redis pattern for scanning
   * Format: rate_limiter:tenant:{tenantId}:scope:{scope}:key:*
   * Or: rate_limiter:tenant:{tenantId}:scope:*:key:* (if no scope provided)
   */
  private makePattern(scope?: string): string {
    if (scope) {
      return `rate_limiter:tenant:${this.tenantId}:scope:${scope}:key:*`;
    }
    return `rate_limiter:tenant:${this.tenantId}:scope:*:key:*`;
  }

  // ============================================================================
  // IRepositoryPortRateLimiter Implementation
  // ============================================================================

  checkRateLimiter(key: string, scope: string): Effect.Effect<RateLimiterResult, Error> {
    return rateLimiterRepoCommonCheckRateLimiter(this.findSingleAdapter, key, scope);
  }

  newAttempt(key: string, scope: string, rule: RateLimitRule): Effect.Effect<RateLimiterResult, Error> {
    return Effect.tryPromise({
      try: async () => {
      try {
        const validation = this.validateKeyScope(key, scope);
        if (!validation.ok) {
          throw new RateLimiterCommonError({ message: 'Key and scope are required and must be at least 2 characters', stage: `${this.constructor.name}.newAttempt:validateKeyScope`, debug: { key, scope } });
        }

      const cacheKey = this.makeKey(key, scope);
      const currentTime = new Date().getTime().toString();
      const maxAttempts = rule.maxAttempts.toString();
      // Separate block duration from TTL
      const blockDurationInSeconds = rule.blockDurationInSeconds;
      const backoffMultiplier = rule.backoffMultiplier && Number.isFinite(rule.backoffMultiplier) && rule.backoffMultiplier > 1
        ? rule.backoffMultiplier
        : 1;
      const maxBlockDurationInSeconds = rule.maxBlockDurationInSeconds && Number.isInteger(rule.maxBlockDurationInSeconds) && rule.maxBlockDurationInSeconds > 0
        ? rule.maxBlockDurationInSeconds
        : blockDurationInSeconds;
      const overrideRedisDefaultTtl = rule.overrideRedisDefaultTtl;
      const minimumTtl = overrideRedisDefaultTtl || this.defaultTtl || 60; // Minimum 1 minute TTL for Redis key
      const effectiveTtl = Math.max(maxBlockDurationInSeconds + 30, minimumTtl); // TTL should be longer than the largest configured block duration

      const blockDurationSeconds = blockDurationInSeconds.toString();
      const ttlSeconds = effectiveTtl.toString();

      const result = await this.executeRateLimiterScript(
        'NEW_ATTEMPT',
        [cacheKey],
        [
          currentTime,
          maxAttempts,
          blockDurationSeconds,
          ttlSeconds,
          key,
          scope,
          backoffMultiplier.toString(),
          maxBlockDurationInSeconds.toString()
        ]
      );

      if (!result) {
        throw new RateLimiterCommonError({ message: 'Failed to process new attempt', stage: `${this.constructor.name}.newAttempt`, debug: { key, scope } });
      }

      // Parse the result
      const rateLimiterData = JSON.parse(result) as IbmRateLimiter;

      // Check if blocked
      const isBlocked = rateLimiterData.blockedAt !== null && rateLimiterData.blockedAt !== undefined;

      this.logger?.debug(
        {
          key,
          scope,
          attempts: rateLimiterData.attempts,
          maxAttempts: rule.maxAttempts,
          isBlocked,
          blockedAt: rateLimiterData.blockedAt,
          blockDurationInSeconds,
          backoffMultiplier,
          maxBlockDurationInSeconds,
          violationStreak: rateLimiterData.violationStreak,
          lastViolationAt: rateLimiterData.lastViolationAt,
          effectiveTtl,
          windowStart: rateLimiterData.windowStart,
          resetAt: rateLimiterData.resetAt
        },
        isBlocked ? 'User blocked due to rate limiting' : 'New attempt processed successfully'
      );

      return {
        isBlocked,
        rateLimiter: rateLimiterData
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Exception in newAttempt';
      this.logger?.error({ errorMessage, key, scope }, 'New attempt failed');
      throw new RateLimiterCommonError({ message: `Failed to process new attempt: ${errorMessage}` , stage: `${this.constructor.name}.newAttempt`, debug: { exception: filterException(err), key, scope } });
    }
    },
      catch: (e) => (e instanceof Error ? e : new Error(String(e)))
    });
  }

  cleanRateLimiter(key: string, scope: string): Effect.Effect<number, Error> {
    return rateLimiterRepoCommonCleanRateLimiter(this.deleteManyAdapter, key, scope);
  }

  cleanupAll(): Effect.Effect<number, Error> {
    return rateLimiterRepoCommonCleanupAll(this.deleteManyAdapter);
  }
}
