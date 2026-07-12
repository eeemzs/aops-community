import { z } from 'zod';

import {
  buildToolInputSchema,
  optionalToolInputNumber,
  optionalToolInputString,
  requiredToolInputString,
  type ToolOperationArg,
} from '../shared/tool-input-guard.js';
import { listSysOperationSpecs } from './catalog.js';
import type { SysOperationInput, SysTypedOperationId } from './io-types.js';

export type SysToolInput<TId extends SysTypedOperationId> = SysOperationInput<TId>;

const SYS_OPERATION_ARGS_BY_ID = new Map<SysTypedOperationId, ReadonlyArray<ToolOperationArg>>(
  listSysOperationSpecs({ refresh: true }).map((operation) => [
    operation.operationId as SysTypedOperationId,
    operation.args,
  ]),
);

const SYS_OPERATION_INPUT_SCHEMA_BY_ID = new Map<SysTypedOperationId, z.ZodTypeAny>([]);

function toRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function pruneUndefined(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeJsonRecord(value: unknown, argName: string): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  if (isPlainRecord(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    try {
      const parsed = JSON.parse(trimmed);
      if (isPlainRecord(parsed)) return parsed;
    } catch {
      // fall through to the error below
    }
  }
  throw new Error(`invalid_arg:${argName}`);
}

function normalizeStringArray(value: unknown, argName: string): string[] | undefined {
  if (value === undefined || value === null) return undefined
  if (Array.isArray(value)) {
    const normalized = value.map((entry) => normalizeString(entry)).filter((entry): entry is string => Boolean(entry))
    return normalized.length > 0 ? normalized : undefined
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          const normalized = parsed
            .map((entry) => normalizeString(entry))
            .filter((entry): entry is string => Boolean(entry))
          return normalized.length > 0 ? normalized : undefined
        }
      } catch {
        throw new Error(`invalid_arg:${argName}`)
      }
    }
    const normalized = trimmed
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
    return normalized.length > 0 ? normalized : undefined
  }
  throw new Error(`invalid_arg:${argName}`)
}

function normalizeOptionalBoolean(value: unknown, argName: string): boolean | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return undefined
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true
    if (['false', '0', 'no', 'off'].includes(normalized)) return false
  }
  throw new Error(`invalid_arg:${argName}`)
}

function normalizeWorkspaceContext(value: Record<string, unknown>): Record<string, unknown> {
  const workspaceId =
    normalizeString(value.workspaceId) ??
    normalizeString(value.workspaceUuid) ??
    normalizeString(value.workspaceUid) ??
    normalizeString(value.workspaceName);

  const normalized = { ...value };
  delete normalized.workspaceId;
  delete normalized.workspaceUuid;
  delete normalized.workspaceUid;
  delete normalized.workspaceName;
  delete normalized.tenantId;
  delete normalized.locale;
  delete normalized.fallbackLocale;

  return pruneUndefined({
    ...normalized,
    ...(workspaceId ? { workspaceId } : {}),
  });
}

function normalizeEventData(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === 'string' ? serialized : undefined;
  } catch {
    throw new Error('invalid_arg:eventData');
  }
}

function buildJsonRecordSchema(argName: string, optional: boolean): z.ZodTypeAny {
  const schema = z.preprocess((value) => normalizeJsonRecord(value, argName), z.record(z.string(), z.unknown()));
  return optional ? schema.optional() : schema;
}

function buildStringArraySchema(argName: string, optional: boolean): z.ZodTypeAny {
  const schema = z.preprocess((value) => normalizeStringArray(value, argName), z.array(z.string().min(1)))
  return optional ? schema.optional() : schema
}

function buildOptionalBooleanSchema(argName: string): z.ZodTypeAny {
  return z.preprocess((value) => normalizeOptionalBoolean(value, argName), z.boolean().optional())
}

function normalizeOccurredAt(value: unknown): Date | undefined {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  throw new Error('invalid_arg:occurredAt');
}

function buildFlatSysInputSchema<TOutput>(
  inner: z.ZodObject<z.ZodRawShape>,
  normalize: (value: Record<string, unknown>) => Record<string, unknown> = normalizeWorkspaceContext,
): z.ZodType<TOutput> {
  return buildToolInputSchema(inner.shape).transform((value) => normalize(toRecord(value)) as TOutput);
}

const rateLimiterCheckInputSchema = buildFlatSysInputSchema<SysToolInput<'rate-limiter.check'>>(
  z
    .object({
      key: requiredToolInputString('key'),
      scope: requiredToolInputString('scope'),
    })
    .strict(),
);

const rateLimiterRecordAttemptInputSchema = buildFlatSysInputSchema<SysToolInput<'rate-limiter.record-attempt'>>(
  z
    .object({
      key: requiredToolInputString('key'),
      scope: requiredToolInputString('scope'),
      rule: buildJsonRecordSchema('rule', true),
    })
    .strict(),
);

const rateLimiterResetInputSchema = buildFlatSysInputSchema<SysToolInput<'rate-limiter.reset'>>(
  z
    .object({
      key: requiredToolInputString('key'),
      scope: requiredToolInputString('scope'),
    })
    .strict(),
);

const rateLimiterCleanupExpiredInputSchema = buildFlatSysInputSchema<SysToolInput<'rate-limiter.cleanup-expired'>>(
  z.object({}).strict(),
);

const countrySearchInputSchema = buildFlatSysInputSchema<SysToolInput<'country.search'>>(
  z
    .object({
      query: optionalToolInputString('query'),
      excludeIso2Codes: buildStringArraySchema('excludeIso2Codes', true),
      limit: optionalToolInputNumber('limit'),
      suggestedFirst: buildOptionalBooleanSchema('suggestedFirst'),
    })
    .strict(),
)

const countryResolveIso2InputSchema = buildFlatSysInputSchema<SysToolInput<'country.resolve-iso2'>>(
  z
    .object({
      iso2Code: requiredToolInputString('iso2Code'),
    })
    .strict(),
)

const rateLimiterStatsInputSchema = buildFlatSysInputSchema<SysToolInput<'rate-limiter.stats'>>(
  z
    .object({
      scope: optionalToolInputString('scope'),
    })
    .strict(),
);

const eventStorePublishPayloadSchema = z
  .object({
    eventType: requiredToolInputString('eventType'),
    aggregateId: requiredToolInputString('aggregateId'),
    eventData: z.unknown().optional(),
    occurredAt: z.union([z.string(), z.date()]).optional(),
    version: optionalToolInputNumber('version'),
    eventId: optionalToolInputString('eventId'),
  })
  .strict();

function normalizeEventStorePublishInput(value: Record<string, unknown>): Record<string, unknown> {
  const eventData = normalizeEventData(value.eventData);
  const occurredAt = normalizeOccurredAt(value.occurredAt);
  return pruneUndefined({
    ...value,
    ...(eventData !== undefined ? { eventData } : {}),
    ...(occurredAt !== undefined ? { occurredAt } : {}),
  });
}

const eventStorePublishInputSchema = buildFlatSysInputSchema<SysToolInput<'event-store.publish'>>(
  eventStorePublishPayloadSchema,
).transform((value) => normalizeEventStorePublishInput(toRecord(value)));

const eventStoreListByAggregateInputSchema = buildFlatSysInputSchema<SysToolInput<'event-store.list-by-aggregate'>>(
  z
    .object({
      aggregateId: requiredToolInputString('aggregateId'),
    })
    .strict(),
);

const eventStoreListByTypeInputSchema = buildFlatSysInputSchema<SysToolInput<'event-store.list-by-type'>>(
  z
    .object({
      eventType: requiredToolInputString('eventType'),
      limit: optionalToolInputNumber('limit'),
    })
    .strict(),
);

const eventStoreListInputSchema = buildFlatSysInputSchema<SysToolInput<'event-store.list'>>(
  z
    .object({
      limit: optionalToolInputNumber('limit'),
    })
    .strict(),
);

const eventStoreCleanupInputSchema = buildFlatSysInputSchema<SysToolInput<'event-store.cleanup'>>(
  z.object({}).strict(),
);

const counterSelectorInputSchema = buildFlatSysInputSchema<SysToolInput<'counter.get'>>(
  z
    .object({
      counterKey: requiredToolInputString('counterKey'),
      scopeId: optionalToolInputString('scopeId'),
    })
    .strict(),
)

const counterListInputSchema = buildFlatSysInputSchema<SysToolInput<'counter.list'>>(
  z
    .object({
      scopeId: optionalToolInputString('scopeId'),
      counterKeyPrefix: optionalToolInputString('counterKeyPrefix'),
      limit: optionalToolInputNumber('limit'),
    })
    .strict(),
)

const counterNextInputSchema = buildFlatSysInputSchema<SysToolInput<'counter.next'>>(
  z
    .object({
      counterKey: requiredToolInputString('counterKey'),
      scopeId: optionalToolInputString('scopeId'),
      prefix: optionalToolInputString('prefix'),
      width: optionalToolInputNumber('width'),
      startAt: optionalToolInputNumber('startAt'),
      step: optionalToolInputNumber('step'),
      metadataJson: buildJsonRecordSchema('metadataJson', true),
    })
    .strict(),
)

const counterPreviewNextInputSchema = counterNextInputSchema as z.ZodType<SysToolInput<'counter.preview-next'>>

const counterResetInputSchema = buildFlatSysInputSchema<SysToolInput<'counter.reset'>>(
  z
    .object({
      counterKey: requiredToolInputString('counterKey'),
      scopeId: optionalToolInputString('scopeId'),
      prefix: optionalToolInputString('prefix'),
      width: optionalToolInputNumber('width'),
      nextValue: optionalToolInputNumber('nextValue'),
      step: optionalToolInputNumber('step'),
      metadataJson: buildJsonRecordSchema('metadataJson', true),
    })
    .strict(),
)

const SYS_OPERATION_INPUT_SCHEMA_BY_ID_INTERNAL = new Map<SysTypedOperationId, z.ZodTypeAny>([
  ['country.search', countrySearchInputSchema],
  ['country.resolve-iso2', countryResolveIso2InputSchema],
  ['rate-limiter.check', rateLimiterCheckInputSchema],
  ['rate-limiter.record-attempt', rateLimiterRecordAttemptInputSchema],
  ['rate-limiter.reset', rateLimiterResetInputSchema],
  ['rate-limiter.cleanup-expired', rateLimiterCleanupExpiredInputSchema],
  ['rate-limiter.stats', rateLimiterStatsInputSchema],
  ['event-store.publish', eventStorePublishInputSchema],
  ['event-store.list-by-aggregate', eventStoreListByAggregateInputSchema],
  ['event-store.list-by-type', eventStoreListByTypeInputSchema],
  ['event-store.list', eventStoreListInputSchema],
  ['event-store.cleanup', eventStoreCleanupInputSchema],
  ['counter.get', counterSelectorInputSchema],
  ['counter.list', counterListInputSchema],
  ['counter.preview-next', counterPreviewNextInputSchema],
  ['counter.next', counterNextInputSchema],
  ['counter.reset', counterResetInputSchema],
]);

for (const [operationId, schema] of SYS_OPERATION_INPUT_SCHEMA_BY_ID_INTERNAL.entries()) {
  SYS_OPERATION_INPUT_SCHEMA_BY_ID.set(operationId, schema);
}

export function getSysOperationArgs<TId extends SysTypedOperationId>(
  operationId: TId,
): ReadonlyArray<ToolOperationArg> {
  return SYS_OPERATION_ARGS_BY_ID.get(operationId) ?? [];
}

export function getSysToolInputSchema<TId extends SysTypedOperationId>(
  operationId: TId,
): z.ZodType<SysToolInput<TId>> | undefined {
  return SYS_OPERATION_INPUT_SCHEMA_BY_ID.get(operationId) as z.ZodType<SysToolInput<TId>> | undefined;
}

export function parseSysToolInput<TId extends SysTypedOperationId>(
  operationId: TId,
  input: unknown,
): SysToolInput<TId> {
  const schema = getSysToolInputSchema(operationId);
  if (!schema) {
    throw new Error(`unknown_sys_operation:${operationId}`);
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? `validation_failed:${operationId}`);
  }

  return parsed.data;
}
