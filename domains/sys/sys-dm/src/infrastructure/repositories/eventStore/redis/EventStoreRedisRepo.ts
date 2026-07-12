// import { filterException } from '@aopslab/xf-core';
import { XfLogger } from '@aopslab/xf-logger';
import { RedisAdapterBase, RedisAdapterConfig, RedisConnection } from '@aopslab/xf-db-redis';
import { Effect } from 'effect'

import { IbmEventStore } from '../../../../domain/models/index.js';
import { IRepositoryPortEventStore } from '../../../../application/ports/repository-ports/IRepositoryPortEventStore.js';
// import { ErrorDomainSys } from '../../../../domain/domain.js';
import { randomUUID } from 'crypto';

/**
 * EventStore-specific Lua Scripts for EventStoreRedisRepo
 */
const EVENT_STORE_LUA_SCRIPTS = {
  // Get events by aggregate with version ordering
  GET_EVENTS_BY_AGGREGATE: `
    local pattern = KEYS[1]
    local aggregateId = ARGV[1]
    local cursor = 0
    local events = {}

    repeat
      local scan = redis.call('SCAN', cursor, 'MATCH', pattern, 'COUNT', 1000)
      cursor = tonumber(scan[1])
      local keys = scan[2]

      for i = 1, #keys do
        local key = keys[i]
        local raw = redis.call('GET', key)
        if raw then
          local data = cjson.decode(raw)
          if data.aggregateId == aggregateId then
            table.insert(events, {
              raw = raw,
              version = data.version or 1,
              occurredAt = data.occurredAt or ''
            })
          end
        end
      end
    until cursor == 0

    -- Sort by version then by occurredAt
    table.sort(events, function(a, b)
      if a.version == b.version then
        return a.occurredAt < b.occurredAt
      end
      return a.version < b.version
    end)

    local result = {}
    for i = 1, #events do
      table.insert(result, events[i].raw)
    end

    return result
  `,

  // Get events by type with timestamp ordering (newest first)
  GET_EVENTS_BY_TYPE: `
    local pattern = KEYS[1]
    local eventType = ARGV[1]
    local limitStr = ARGV[2]
    local limit = tonumber(limitStr) or 0
    local cursor = 0
    local events = {}

    repeat
      local scan = redis.call('SCAN', cursor, 'MATCH', pattern, 'COUNT', 1000)
      cursor = tonumber(scan[1])
      local keys = scan[2]

      for i = 1, #keys do
        local key = keys[i]
        local raw = redis.call('GET', key)
        if raw then
          local data = cjson.decode(raw)
          if data.eventType == eventType then
            table.insert(events, {
              raw = raw,
              occurredAt = data.occurredAt or ''
            })
          end
        end
      end
    until cursor == 0

    -- Sort by occurredAt desc (newest first)
    table.sort(events, function(a, b)
      return a.occurredAt > b.occurredAt
    end)

    -- Apply limit if specified
    local result = {}
    local count = limit > 0 and math.min(limit, #events) or #events
    for i = 1, count do
      table.insert(result, events[i].raw)
    end

    return result
  `,

  // Get all events with timestamp ordering (newest first)
  GET_ALL_EVENTS: `
    local pattern = KEYS[1]
    local limitStr = ARGV[1]
    local limit = tonumber(limitStr) or 0
    local cursor = 0
    local events = {}

    repeat
      local scan = redis.call('SCAN', cursor, 'MATCH', pattern, 'COUNT', 1000)
      cursor = tonumber(scan[1])
      local keys = scan[2]

      for i = 1, #keys do
        local key = keys[i]
        local raw = redis.call('GET', key)
        if raw then
          local data = cjson.decode(raw)
          table.insert(events, {
            raw = raw,
            occurredAt = data.occurredAt or ''
          })
        end
      end
    until cursor == 0

    -- Sort by occurredAt desc (newest first)
    table.sort(events, function(a, b)
      return a.occurredAt > b.occurredAt
    end)

    -- Apply limit if specified
    local result = {}
    local count = limit > 0 and math.min(limit, #events) or #events
    for i = 1, count do
      table.insert(result, events[i].raw)
    end

    return result
  `
} as const;

export class EventStoreRedisRepo extends RedisAdapterBase<IbmEventStore> implements IRepositoryPortEventStore {
  private readonly defaultTtl?: number;
  private scriptsInitialized = false;

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

  /**
   * Lazy initialization of event store-specific Lua scripts
   */
  private async ensureScriptsLoaded(): Promise<void> {
    if (this.scriptsInitialized) {
      return;
    }

    try {
      this.logger?.debug('Loading event store-specific Lua scripts...');

      const loadPromises = Object.entries(EVENT_STORE_LUA_SCRIPTS).map(async ([name, script]) => {
        if (!this.redisConnection.isScriptLoaded(name)) {
          await this.redisConnection.loadScript(name, script);
          this.logger?.debug(`Loaded event store script: ${name}`);
        } else {
          this.logger?.debug(`Event store script already loaded: ${name}`);
        }
        return name;
      });

      await Promise.all(loadPromises);
      this.scriptsInitialized = true;
      this.logger?.info('Event store Lua scripts initialized successfully');
    } catch (error) {
      this.logger?.error({ error }, 'Failed to load event store Lua scripts');
      throw error;
    }
  }

  /**
   * Execute event store-specific Lua script with automatic initialization
   */
  private async executeEventStoreScript(
    scriptName: keyof typeof EVENT_STORE_LUA_SCRIPTS,
    keys: string[] = [],
    args: string[] = []
  ): Promise<any> {
    await this.ensureScriptsLoaded();

    try {
      return await this.redisConnection.evalScript(scriptName, keys, args);
    } catch (error) {
      // If script not found, try reloading and retry once
      if (
        error instanceof Error &&
        (error.message.includes('not found in Redis cache') ||
          error.message.includes('not loaded') ||
          error.message.includes('NOSCRIPT'))
      ) {
        this.logger?.warn(`Reloading event store script: ${scriptName}`);
        this.scriptsInitialized = false;
        await this.ensureScriptsLoaded();
        return await this.redisConnection.evalScript(scriptName, keys, args);
      }
      throw error;
    }
  }

  /**
   * Generate Redis key for event store
   * Format: event_store:tenant:{tenantId}:event:{id}
   */
  private makeKey(eventId: string): string {
    return `event_store:tenant:${this.tenantId}:event:${eventId}`;
  }

  /**
   * Generate Redis pattern for scanning
   * Format: event_store:tenant:{tenantId}:event:*
   */
  private makePattern(): string {
    return `event_store:tenant:${this.tenantId}:event:*`;
  }

  /**
   * Event kaydet - En temel işlem
   */
  storeEvent(event: IbmEventStore): Effect.Effect<IbmEventStore, Error> {
    return Effect.tryPromise({
      try: async () => {
      try {
      // Generate ID if not provided
      const eventId = event.id || randomUUID();
      const eventKey = this.makeKey(eventId);
      const now = new Date();
      const ttl = this.defaultTtl;

      this.logger?.debug(
        {
          eventType: event.eventType,
          aggregateId: event.aggregateId,
          eventId: eventId,
          ttl
        },
        'storeEvent'
      );

      // Update event fields BEFORE writing to Redis
      const updatedEvent = {
        ...event,
        id: eventId, // Ensure ID is set
        createdAt: now,
        updatedAt: now,
        occurredAt: event.occurredAt || now
      };

      const result = await super.set(eventKey, updatedEvent, ttl);
      if (result.ok) {
        return updatedEvent;
      }
      throw new Error('Failed to store event in Redis');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Exception in storeEvent';
      this.logger?.error({ errorMessage, event }, 'Store event failed');
      throw new Error(`Failed to store event: ${errorMessage}`);
    }
    },
      catch: (e) => (e instanceof Error ? e : new Error(String(e)))
    });
  }

  /**
   * Aggregate'a göre eventleri getir - Event Sourcing için gerekli
   */
  getEventsByAggregate(aggregateId: string): Effect.Effect<IbmEventStore[], Error> {
    return Effect.tryPromise({
      try: async () => {
      try {
      this.logger?.debug({ aggregateId }, 'getEventsByAggregate');

      const pattern = this.makePattern();
      const result = await this.executeEventStoreScript('GET_EVENTS_BY_AGGREGATE', [pattern], [aggregateId]);

      const events: IbmEventStore[] = [];
      if (Array.isArray(result)) {
        for (const eventJson of result) {
          try {
            const event = JSON.parse(eventJson) as IbmEventStore;
            events.push(event);
          } catch (parseError) {
            this.logger?.warn({ parseError, eventJson }, 'Failed to parse event data');
          }
        }
      }

      this.logger?.debug({ aggregateId, eventCount: events.length }, 'Events found by aggregate');
      return events;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Exception in getEventsByAggregate';
      this.logger?.error({ errorMessage, aggregateId }, 'Get events by aggregate failed');
      throw new Error(`Failed to get events by aggregate: ${errorMessage}`);
    }
    },
      catch: (e) => (e instanceof Error ? e : new Error(String(e)))
    });
  }

  /**
   * Event type'a göre eventleri getir - Event type filtering
   */
  getEventsByType(eventType: string, limit?: number): Effect.Effect<IbmEventStore[], Error> {
    return Effect.tryPromise({
      try: async () => {
      try {
      this.logger?.debug({ eventType, limit }, 'getEventsByType');

      const pattern = this.makePattern();
      const result = await this.executeEventStoreScript('GET_EVENTS_BY_TYPE', [pattern], [eventType, (limit || 0).toString()]);

      const events: IbmEventStore[] = [];
      if (Array.isArray(result)) {
        for (const eventJson of result) {
          try {
            const event = JSON.parse(eventJson) as IbmEventStore;
            events.push(event);
          } catch (parseError) {
            this.logger?.warn({ parseError, eventJson }, 'Failed to parse event data');
          }
        }
      }

      this.logger?.debug({ eventType, eventCount: events.length, limit }, 'Events found by type');
      return events;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Exception in getEventsByType';
      this.logger?.error({ errorMessage, eventType }, 'Get events by type failed');
      throw new Error(`Failed to get events by type: ${errorMessage}`);
    }
    },
      catch: (e) => (e instanceof Error ? e : new Error(String(e)))
    });
  }

  /**
   * Tüm eventleri getir - Basit listeleme
   */
  getAllEvents(limit?: number): Effect.Effect<IbmEventStore[], Error> {
    return Effect.tryPromise({
      try: async () => {
      try {
      this.logger?.debug({ limit }, 'getAllEvents');

      const pattern = this.makePattern();
      const result = await this.executeEventStoreScript('GET_ALL_EVENTS', [pattern], [(limit || 0).toString()]);

      const events: IbmEventStore[] = [];
      if (Array.isArray(result)) {
        for (const eventJson of result) {
          try {
            const event = JSON.parse(eventJson) as IbmEventStore;
            events.push(event);
          } catch (parseError) {
            this.logger?.warn({ parseError, eventJson }, 'Failed to parse event data');
          }
        }
      }

      this.logger?.debug({ eventCount: events.length, limit }, 'All events retrieved');
      return events;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Exception in getAllEvents';
      this.logger?.error({ errorMessage }, 'Get all events failed');
      throw new Error(`Failed to get all events: ${errorMessage}`);
    }
    },
      catch: (e) => (e instanceof Error ? e : new Error(String(e)))
    });
  }

  /**
   * Test amaçlı temizleme
   */
  cleanupAll(): Effect.Effect<number, Error> {
    return Effect.tryPromise({
      try: async () => {
      try {
      const pattern = this.makePattern();
      const client = await this.getRedisClient();
      const keysToDelete: string[] = [];

      let cursor = 0;

      // Scan all keys matching the tenant pattern
      do {
        const scanResult = await client.scan(cursor.toString(), {
          MATCH: pattern,
          COUNT: 1000
        });
        cursor = Number(scanResult.cursor);
        const keys = scanResult.keys;

        if (keys.length > 0) {
          keysToDelete.push(...keys);
        }
      } while (cursor !== 0);

      let deletedCount = 0;
      if (keysToDelete.length > 0) {
        deletedCount = await client.unlink(keysToDelete);
      }

      this.logger?.debug({ deletedCount, tenantId: this.tenantId, pattern }, 'All tenant events cleaned up from cache');

      return deletedCount;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Exception in cleanupAll';
      this.logger?.error({ errorMessage, tenantId: this.tenantId }, 'Cleanup all events failed');
      throw new Error(`Failed to cleanup all events: ${errorMessage}`);
    }
    },
      catch: (e) => (e instanceof Error ? e : new Error(String(e)))
    });
  }
}
