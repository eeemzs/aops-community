import assert from 'node:assert/strict'
import test from 'node:test'

import { canReuseCommunityNativeMigrationPlanAcceptanceHistory } from '../dist/lib/community-native-lifecycle.js'

const baseline = Object.freeze({
  schemaVersion: 1,
  status: 'community-native-migration-plan-acceptance',
  instanceName: 'default',
  installId: '32d392fc-aeaa-450e-adbb-aed05598e1b0',
  policyId: 'aops-community-strict-migration-v1',
  targetLineageId: 'strict-v1',
  resultLineageId: 'strict-v1',
  resultSchemaFingerprintSha256: 'a'.repeat(64),
  resultReceiptFingerprintSha256: 'b'.repeat(64),
  acceptedPlanSha256: 'c'.repeat(64),
  action: 'verify-only',
  sourceMigrationStateFingerprintSha256: 'd'.repeat(64),
  resultMigrationStateFingerprintSha256: 'e'.repeat(64),
  snapshotEvidenceKind: null,
  snapshotEvidenceSha256: null,
  acceptedAt: '2026-07-22T00:00:00.000Z',
})

test('repeat verify-only acceptance reuses immutable history after application data changes', () => {
  const repeated = {
    ...baseline,
    resultMigrationStateFingerprintSha256: 'f'.repeat(64),
    acceptedAt: '2026-07-22T01:00:00.000Z',
  }

  assert.equal(canReuseCommunityNativeMigrationPlanAcceptanceHistory(baseline, repeated), true)
})

test('repeat verification still fails closed when migration identity changes', () => {
  assert.equal(canReuseCommunityNativeMigrationPlanAcceptanceHistory(baseline, {
    ...baseline,
    resultSchemaFingerprintSha256: 'f'.repeat(64),
  }), false)
})

test('migrate acceptance history remains fully immutable', () => {
  const applied = { ...baseline, action: 'migrate' }
  assert.equal(canReuseCommunityNativeMigrationPlanAcceptanceHistory(applied, {
    ...applied,
    acceptedAt: '2026-07-22T01:00:00.000Z',
  }), false)
})
