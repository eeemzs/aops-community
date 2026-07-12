import { z } from 'zod'

export const counterKeyZodSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z][a-z0-9.-]*[a-z0-9]$/i, 'counterKey must use dot/dash separated text')

export const counterZodSchemaInsert = z.object({
  scopeId: z.string().trim().min(1).default('default'),
  counterKey: counterKeyZodSchema,
  prefix: z.string().trim().min(1).max(24).optional().nullable(),
  width: z.number().int().min(1).max(18).optional().nullable(),
  nextValue: z.number().int().min(0).default(1),
  step: z.number().int().min(1).max(1000).default(1),
  lastValue: z.number().int().min(0).optional().nullable(),
  lastFormattedValue: z.string().trim().min(1).optional().nullable(),
  metadataJson: z.record(z.string(), z.unknown()).optional().nullable(),
})

export const counterZodSchema = counterZodSchemaInsert.extend({
  id: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  createdAt: z.union([z.string(), z.date()]).optional().nullable(),
  updatedAt: z.union([z.string(), z.date()]).optional().nullable(),
})
