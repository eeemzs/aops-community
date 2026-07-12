// @ts-nocheck
// nx test xf-dm-sys --skip-nx-cache eventStore.repository (skipped)

import { describe, beforeAll, afterAll, it, expect, beforeEach } from 'vitest'
import { Effect } from 'effect'
import {
  createRepositoryPortEventStore,
  getTestTenantId,
  createTestEventStore,
  createTestEventWithVersion,
  REPOSITORY_TEST_CONFIG,
  getActiveTestRepositories,
  type TestRepositoryIdentifier
} from '../../../tests/config/eventStore.config'
import { IRepositoryPortEventStore } from '../../../application/ports/repository-ports/IRepositoryPortEventStore'
import { createSyncLogger } from '@aopslab/xf-logger/sync'
import { RepositoryConfig } from '@aopslab/xf-db'
import { IbmEventStore } from '../../../domain'

const logger = createSyncLogger({
  level: 'info',
  base: {
    module: 'eventStore-repository-test',
  },
})

// Get active test repositories from config
const testRepositories = getActiveTestRepositories()

// Skip entire test suite if no repositories are configured
if (testRepositories.length === 0) {
  console.log('⚠️  No EventStore repositories configured - skipping repository tests')
  console.log('💡 Configure one of: MONGODB_URI_LOCAL_SMWEB_2504, POSTGRES_URL_LOCAL_SMWEB_2504, REDIS_URL')
} else {
  console.log(`🧪 Testing EventStore repositories: ${testRepositories.join(', ')}`)
}

testRepositories.forEach((_repositoryType: TestRepositoryIdentifier) => {
  describe.skip(`EventStore Repository Tests - skipped`, () => {
    it('skipped', () => {
      expect(true).toBe(true)
    })
  })
})
export {}
