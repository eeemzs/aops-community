import mongoose, { Schema } from 'mongoose'
import type { IbmCounter } from '../../../../domain/models/index.js'

export interface IdbCounter extends IbmCounter {}

const CounterSchema = new Schema<IdbCounter>(
  {
    tenantId: { type: String, required: true },
    scopeId: { type: String, required: true, default: 'default' },
    counterKey: { type: String, required: true },
    prefix: { type: String },
    width: { type: Number, required: true, default: 5 },
    nextValue: { type: Number, required: true, default: 1 },
    step: { type: Number, required: true, default: 1 },
    lastValue: { type: Number },
    lastFormattedValue: { type: String },
    metadataJson: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
    collection: 'sys_counters',
  },
)

CounterSchema.index({ tenantId: 1, scopeId: 1, counterKey: 1 }, { unique: true })

export const DbCounter =
  mongoose.models.SysCounter || mongoose.model<IdbCounter>('SysCounter', CounterSchema)
