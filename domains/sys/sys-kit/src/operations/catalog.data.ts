import type { SysOperationArgument, SysOperationEffect, SysOperationPolicy } from './types.js'

export type SysCrudEntityDefinition = {
  entity: string
  serviceKey: string
  serviceEntityPascal: string
}

export type SysCustomOperationDefinition = {
  operationId: string
  serviceKey: string
  serviceEntity: string
  methodName: string
  args: readonly SysOperationArgument[]
  toolId?: string
  summary?: string
  tags?: string[]
  sideEffect?: SysOperationEffect
  policy?: SysOperationPolicy
  examples?: string[]
}

export const SYS_CRUD_ENTITIES = [
  // sys domain operations will be added incrementally from real service contracts.
] as const satisfies readonly SysCrudEntityDefinition[]

export const SYS_CUSTOM_OPERATIONS = [
  {
    operationId: 'country.search',
    serviceKey: 'countryService',
    serviceEntity: 'country',
    methodName: 'listCountries',
    args: [{ name: 'input', optional: true }],
    summary: 'List shared country reference records for UI and domain consumers.',
    sideEffect: 'none',
    tags: ['country', 'reference-data', 'read'],
    examples: ['{}', '{"query":"tur","limit":10}', '{"excludeIso2Codes":["TR"]}'],
  },
  {
    operationId: 'country.resolve-iso2',
    serviceKey: 'countryService',
    serviceEntity: 'country',
    methodName: 'getCountryByIso2Code',
    args: [{ name: 'iso2Code', optional: false }],
    summary: 'Resolve one shared country record by ISO2 code.',
    sideEffect: 'none',
    tags: ['country', 'reference-data', 'read'],
    examples: ['{"iso2Code":"TR"}'],
  },
  {
    operationId: 'rate-limiter.check',
    serviceKey: 'rateLimiterService',
    serviceEntity: 'rate-limiter',
    methodName: 'checkRateLimit',
    args: [
      { name: 'key', optional: false },
      { name: 'scope', optional: false },
    ],
    summary: 'Check whether key+scope is currently rate-limited.',
    sideEffect: 'none',
    tags: ['rate-limiter', 'read'],
    examples: ['{"key":"user:123","scope":"login"}'],
  },
  {
    operationId: 'rate-limiter.record-attempt',
    serviceKey: 'rateLimiterService',
    serviceEntity: 'rate-limiter',
    methodName: 'recordAttempt',
    args: [
      { name: 'key', optional: false },
      { name: 'scope', optional: false },
      { name: 'rule', optional: true },
    ],
    summary: 'Record attempt and update rate-limit state.',
    sideEffect: 'db',
    tags: ['rate-limiter', 'write'],
    examples: [
      '{"key":"user:123","scope":"login"}',
      '{"key":"user:123","scope":"login","rule":{"maxAttempts":5,"blockDurationInSeconds":60}}',
      '{"key":"user:123","scope":"login","rule":{"maxAttempts":5,"blockDurationInSeconds":60,"backoffMultiplier":2,"maxBlockDurationInSeconds":900}}',
    ],
  },
  {
    operationId: 'rate-limiter.reset',
    serviceKey: 'rateLimiterService',
    serviceEntity: 'rate-limiter',
    methodName: 'resetRateLimit',
    args: [
      { name: 'key', optional: false },
      { name: 'scope', optional: false },
    ],
    summary: 'Reset rate-limit counters for key+scope.',
    sideEffect: 'db',
    tags: ['rate-limiter', 'write'],
    examples: ['{"key":"user:123","scope":"login"}'],
  },
  {
    operationId: 'rate-limiter.cleanup-expired',
    serviceKey: 'rateLimiterService',
    serviceEntity: 'rate-limiter',
    methodName: 'cleanupExpiredEntries',
    args: [],
    summary: 'Cleanup expired rate-limit entries.',
    sideEffect: 'db',
    tags: ['rate-limiter', 'maintenance'],
    examples: ['{}'],
  },
  {
    operationId: 'rate-limiter.stats',
    serviceKey: 'rateLimiterService',
    serviceEntity: 'rate-limiter',
    methodName: 'getRateLimitStats',
    args: [{ name: 'scope', optional: true }],
    summary: 'Get rate-limit statistics.',
    sideEffect: 'none',
    tags: ['rate-limiter', 'read'],
    examples: ['{}', '{"scope":"login"}'],
  },
  {
    operationId: 'event-store.publish',
    serviceKey: 'eventStoreService',
    serviceEntity: 'event-store',
    methodName: 'publishEvent',
    args: [
      { name: 'eventType', optional: false },
      { name: 'aggregateId', optional: false },
      { name: 'eventData', optional: true },
      { name: 'occurredAt', optional: true },
      { name: 'version', optional: true },
      { name: 'eventId', optional: true },
    ],
    summary: 'Publish and persist a domain event.',
    sideEffect: 'db',
    tags: ['event-store', 'write'],
    examples: ['{"eventType":"UserCreated","aggregateId":"user:123","eventData":{"email":"mzs@example.com"}}'],
  },
  {
    operationId: 'event-store.list-by-aggregate',
    serviceKey: 'eventStoreService',
    serviceEntity: 'event-store',
    methodName: 'getEventsByAggregate',
    args: [{ name: 'aggregateId', optional: false }],
    summary: 'List events for an aggregate id.',
    sideEffect: 'none',
    tags: ['event-store', 'read'],
    examples: ['{"aggregateId":"user:123"}'],
  },
  {
    operationId: 'event-store.list-by-type',
    serviceKey: 'eventStoreService',
    serviceEntity: 'event-store',
    methodName: 'getEventsByType',
    args: [
      { name: 'eventType', optional: false },
      { name: 'limit', optional: true },
    ],
    summary: 'List events by type.',
    sideEffect: 'none',
    tags: ['event-store', 'read'],
    examples: ['{"eventType":"UserCreated"}', '{"eventType":"UserCreated","limit":10}'],
  },
  {
    operationId: 'event-store.list',
    serviceKey: 'eventStoreService',
    serviceEntity: 'event-store',
    methodName: 'getAllEvents',
    args: [{ name: 'limit', optional: true }],
    summary: 'List all events.',
    sideEffect: 'none',
    tags: ['event-store', 'read'],
    examples: ['{}', '{"limit":50}'],
  },
  {
    operationId: 'event-store.cleanup',
    serviceKey: 'eventStoreService',
    serviceEntity: 'event-store',
    methodName: 'cleanupAll',
    args: [],
    summary: 'Cleanup event-store resources.',
    sideEffect: 'db',
    tags: ['event-store', 'maintenance'],
    examples: ['{}'],
  },
  {
    operationId: 'counter.get',
    serviceKey: 'counterService',
    serviceEntity: 'counter',
    methodName: 'getCounter',
    args: [{ name: 'input', optional: false }],
    summary: 'Resolve one tenant-scoped counter by scope and key.',
    sideEffect: 'none',
    tags: ['counter', 'read'],
    examples: ['{"counterKey":"inventory.item.code"}', '{"counterKey":"purchase.order.code","scopeId":"default"}'],
  },
  {
    operationId: 'counter.list',
    serviceKey: 'counterService',
    serviceEntity: 'counter',
    methodName: 'listCounters',
    args: [{ name: 'input', optional: true }],
    summary: 'List tenant-scoped counters with optional scope and key-prefix filters.',
    sideEffect: 'none',
    tags: ['counter', 'read'],
    examples: ['{}', '{"counterKeyPrefix":"inventory."}', '{"scopeId":"default","limit":50}'],
  },
  {
    operationId: 'counter.preview-next',
    serviceKey: 'counterService',
    serviceEntity: 'counter',
    methodName: 'previewNextCounter',
    args: [{ name: 'input', optional: false }],
    summary: 'Preview the next formatted counter value without mutating the counter.',
    sideEffect: 'none',
    tags: ['counter', 'read', 'preview'],
    examples: ['{"counterKey":"inventory.item.code","prefix":"ITM","width":5}'],
  },
  {
    operationId: 'counter.next',
    serviceKey: 'counterService',
    serviceEntity: 'counter',
    methodName: 'allocateNextCounter',
    args: [{ name: 'input', optional: false }],
    summary: 'Atomically allocate the next formatted counter value.',
    sideEffect: 'db',
    tags: ['counter', 'write'],
    examples: ['{"counterKey":"inventory.item.code","prefix":"ITM","width":5}'],
  },
  {
    operationId: 'counter.reset',
    serviceKey: 'counterService',
    serviceEntity: 'counter',
    methodName: 'resetCounter',
    args: [{ name: 'input', optional: false }],
    summary: 'Create or reset a tenant-scoped counter sequence.',
    sideEffect: 'db',
    tags: ['counter', 'write', 'maintenance'],
    examples: ['{"counterKey":"inventory.item.code","prefix":"ITM","width":5,"nextValue":1}'],
  },
] as const satisfies readonly SysCustomOperationDefinition[]
