import { domainCollectionName } from '../../domain-naming.js'
import { IdbmMongo } from '@aopslab/xf-db-mongoose';
import { Ibm } from '@aopslab/xf-bm';

// ESM version of mongoose:
import mongoose, { Model, Types } from 'mongoose';
import { IbmEventStore } from '../../../../domain/models/index.js';
const { model, models, Schema } = mongoose;

// Convert Business Model to DB Model (Naming convention & Type conversion)
export interface IdbEventStore extends IdbmMongo, Omit<IbmEventStore, keyof Ibm | 'eventId'> {
  // No special type conversions needed for EventStore
  // All fields from IbmEventStore are directly compatible with MongoDB
  // IdbmMongo provides _id, __v fields for MongoDB
  eventId: Types.UUID;
}

export type EventStoreColumns = keyof IdbEventStore;

const schemaEventStore = new Schema<IdbEventStore>(
  {
    // Ibm inherited fields (handled by IdbmMongo)
    tenantId: { type: Schema.Types.UUID },

    // Minimal Event Store fields
    eventId: {
      type: Schema.Types.UUID,
      required: true,
      index: true,
      unique: true,
      // TypeScript Mongoose Schema Fix: Use new Types.UUID() instead of randomUUID()
      // ❌ Problem: default: () => randomUUID() returns string, incompatible with Schema.Types.UUID
      // ✅ Solution: Use mongoose Types.UUID() constructor for proper UUID object creation
      // Note: This creates mongoose-compatible UUID objects, not plain strings
      default: () => new Types.UUID()
    },
    eventType: { type: String, required: true },
    aggregateId: { type: String, required: true },
    eventData: { type: String, required: true }, // JSON string
    version: { type: Number, required: true, default: 1 },
    occurredAt: { type: Date, required: true, default: Date.now }
  },
  {
    timestamps: true // Automatically adds createdAt and updatedAt
  }
);

// Create indexes for efficient querying
schemaEventStore.index({ tenantId: 1, eventType: 1 }); // Query by tenant and event type
schemaEventStore.index({ tenantId: 1, aggregateId: 1 }); // Query by aggregate
schemaEventStore.index({ tenantId: 1, occurredAt: 1 }); // Query by time range

export const DbEventStore: Model<IdbEventStore> =
  (models?.DbEventStore as Model<IdbEventStore>) || model<IdbEventStore>('DbEventStore', schemaEventStore, domainCollectionName('DbEventStore'));
