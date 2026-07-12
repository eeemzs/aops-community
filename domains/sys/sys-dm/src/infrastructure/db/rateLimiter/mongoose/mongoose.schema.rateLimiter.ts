import { domainCollectionName } from '../../domain-naming.js'

import { IdbmMongo } from '@aopslab/xf-db-mongoose';
import { Ibm } from '@aopslab/xf-bm';

// ESM version of mongoose:
import mongoose, { Model } from 'mongoose';
import { IbmRateLimiter } from '../../../../domain/models/index.js';
const { model, models, Schema } = mongoose;

// Convert Business Model to DB Model (Naming convention & Type conversion)
export interface IdbRateLimiter extends IdbmMongo, Omit<IbmRateLimiter, keyof Ibm> {
  // No special type conversions needed for RateLimiter
}

export type RateLimiterColumns = keyof IdbRateLimiter;

const schemaRateLimiter = new Schema<IdbRateLimiter>(
  {
    tenantId: { type: Schema.Types.UUID },
    key: { type: String, required: true },
    scope: { type: String, required: true },
    attempts: { type: Number, required: true, default: 0 },
    windowStart: { type: Date },
    resetAt: { type: Date },
    blockedAt: { type: Date },
    violationStreak: { type: Number, required: true, default: 0 },
    lastViolationAt: { type: Date }
  },
  {
    timestamps: true
  }
);

// Create a compound index on key and type for quick lookups
schemaRateLimiter.index({ tenantId: 1, key: 1, type: 1 }, { unique: true });

export const DbRateLimiter: Model<IdbRateLimiter> =
  (models?.DbRateLimiter as Model<IdbRateLimiter>) || model<IdbRateLimiter>('DbRateLimiter', schemaRateLimiter, domainCollectionName('DbRateLimiter'));
