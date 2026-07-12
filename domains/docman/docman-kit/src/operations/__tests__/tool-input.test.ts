import { describe, expect, it } from 'vitest'

import { parseDocmanToolInput } from '../tool-input.js'

describe('docman backup capability tool input', () => {
  it('accepts standard list-style filter/options envelope', () => {
    expect(
      parseDocmanToolInput('backup-capability.list', {
        filter: { domain: 'docman' },
        options: { limit: 20 },
      }),
    ).toEqual({
      filter: { domain: 'docman' },
      options: { limit: 20 },
    })
  })
})
