import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runDocmanKitOperationByTypedId: vi.fn(),
}))

vi.mock('@aopslab/domain-kit-docman', () => ({
  runDocmanKitOperationByTypedId: mocks.runDocmanKitOperationByTypedId,
}))

import {
  saveDocmanGroupFlow,
  saveDocmanDocumentFlow,
  saveDocmanSectionFlow,
  createDocmanDocumentVersionFlow,
  createDocmanPageWithInitialVersionFlow,
  createLinkedDocmanPage,
  createLinkedDocmanSection,
  copyDocmanPageFlow,
  copyDocmanSectionFlow,
  linkExistingDocmanSection,
  linkExistingDocmanPageVersion,
  updateDocmanDocumentSectionLinksFlow,
  updateDocmanSectionPageLinksFlow,
  saveDocmanPageVersionDraftFlow,
  updateDocmanDocumentVersionFlow,
  updateDocmanPageFlow,
  inferDocmanFlowErrorStatus,
  normalizeDocmanFlowAction,
} from '../index'

describe('docman product controllers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes known flow actions', () => {
    expect(normalizeDocmanFlowAction('save-group')).toBe('save-group')
    expect(normalizeDocmanFlowAction(' save-document ')).toBe('save-document')
    expect(normalizeDocmanFlowAction(' save-section ')).toBe('save-section')
    expect(normalizeDocmanFlowAction('create-linked-section')).toBe('create-linked-section')
    expect(normalizeDocmanFlowAction(' link-existing-section ')).toBe('link-existing-section')
    expect(normalizeDocmanFlowAction(' link-existing-page-version ')).toBe('link-existing-page-version')
    expect(normalizeDocmanFlowAction(' update-document-section-links ')).toBe('update-document-section-links')
    expect(normalizeDocmanFlowAction(' update-section-page-links ')).toBe('update-section-page-links')
    expect(normalizeDocmanFlowAction(' save-page-version-draft ')).toBe('save-page-version-draft')
    expect(normalizeDocmanFlowAction(' update-document-version ')).toBe('update-document-version')
    expect(normalizeDocmanFlowAction(' update-page ')).toBe('update-page')
    expect(normalizeDocmanFlowAction(' create-document-version ')).toBe('create-document-version')
    expect(normalizeDocmanFlowAction(' create-page-with-initial-version ')).toBe('create-page-with-initial-version')
    expect(normalizeDocmanFlowAction(' copy-section ')).toBe('copy-section')
    expect(normalizeDocmanFlowAction(' copy-page ')).toBe('copy-page')
    expect(normalizeDocmanFlowAction('unknown')).toBe('')
  })

  it('maps known resolution failures to 404', () => {
    expect(inferDocmanFlowErrorStatus('Document version could not be resolved.')).toBe(404)
    expect(inferDocmanFlowErrorStatus('Document could not be resolved.')).toBe(404)
    expect(inferDocmanFlowErrorStatus('Section could not be resolved.')).toBe(404)
    expect(inferDocmanFlowErrorStatus('Group could not be resolved.')).toBe(404)
    expect(inferDocmanFlowErrorStatus('Page could not be resolved.')).toBe(404)
    expect(inferDocmanFlowErrorStatus('Section is already linked in document outline.')).toBe(409)
    expect(inferDocmanFlowErrorStatus('Page version could not be resolved.')).toBe(404)
    expect(inferDocmanFlowErrorStatus('Document section link could not be resolved.')).toBe(404)
    expect(inferDocmanFlowErrorStatus('Section page link could not be resolved.')).toBe(404)
    expect(inferDocmanFlowErrorStatus('Page version is already linked in section.')).toBe(409)
    expect(inferDocmanFlowErrorStatus('unauthorized')).toBe(401)
    expect(inferDocmanFlowErrorStatus('validation_failed')).toBe(400)
  })

  it('defaults create-document-version flow to clean init mode when none is provided', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })
      if (operationId === 'document-version.create') {
        return { item: { id: 'doc-version-1', documentId: 'document-1', version: 1, status: 'draft' } }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await createDocmanDocumentVersionFlow({
      scopeId: 'workspace-1',
      documentId: 'document-1',
      data: {
        documentId: 'document-1',
        version: 1,
        status: 'draft',
        title: 'Architecture v1',
      },
    })

    expect(calls.map((entry) => entry.operationId)).toEqual(['document-version.create'])
    expect(result).toMatchObject({
      action: 'create-document-version',
      documentVersionId: 'doc-version-1',
      documentInitMode: 'clean',
      clonedLinkCount: 0,
    })
  })

  it('creates a group and returns the normalized snapshot', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'document-group.create') {
        return { item: { id: 'group-2' } }
      }
      if (operationId === 'document-group.list') {
        return {
          items: [
            {
              id: 'group-2',
              groupUid: 'GRP-2',
              title: 'Operations',
              parentGroupId: 'group-root',
              description: 'Ops docs',
            },
          ],
        }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await saveDocmanGroupFlow({
      scopeId: 'workspace-1',
      data: {
        groupUid: 'GRP-2',
        title: 'Operations',
        parentGroupId: 'group-root',
        description: 'Ops docs',
      },
    })

    expect(calls.map((entry) => entry.operationId)).toEqual(['document-group.create'])
    expect(result).toMatchObject({
      action: 'save-group',
      mode: 'create',
      groupId: 'group-2',
      group: {
        id: 'group-2',
        groupUid: 'GRP-2',
        title: 'Operations',
        parentGroupId: 'group-root',
        description: 'Ops docs',
      },
      focusGroupId: 'group-2',
    })
  })

  it('updates a document and returns the normalized snapshot', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'document.update') {
        return { ok: true }
      }
      if (operationId === 'document.get') {
        return {
          item: {
            id: 'document-2',
            documentUid: 'DOC-2',
            groupId: 'group-root',
            slug: 'ops-overview',
            title: 'Operations Overview',
            summary: 'Ops summary',
            visibility: 'internal',
            status: 'draft',
          },
        }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await saveDocmanDocumentFlow({
      scopeId: 'workspace-1',
      documentId: 'document-2',
      data: {
        title: 'Operations Overview',
        summary: 'Ops summary',
      },
    })

    expect(calls.map((entry) => entry.operationId)).toEqual(['document.update', 'document.get'])
    expect(calls[0]?.input).toEqual({
      scopeId: 'workspace-1',
      id: 'document-2',
      patch: {
        title: 'Operations Overview',
        summary: 'Ops summary',
      },
    })
    expect(result).toMatchObject({
      action: 'save-document',
      mode: 'edit',
      documentId: 'document-2',
      document: {
        id: 'document-2',
        documentUid: 'DOC-2',
        title: 'Operations Overview',
        summary: 'Ops summary',
      },
      focusDocumentId: 'document-2',
    })
  })

  it('creates a section and returns section plus section record snapshots', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'section.create') {
        return { item: { id: 'section-4' } }
      }
      if (operationId === 'section.get') {
        return {
          item: {
            id: 'section-4',
            sectionUid: 'SEC-4',
            title: 'Deployment',
            kind: 'container',
            slug: 'deployment',
          },
        }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await saveDocmanSectionFlow({
      scopeId: 'workspace-1',
      data: {
        sectionUid: 'SEC-4',
        title: 'Deployment',
        kind: 'container',
        slug: 'deployment',
      },
    })

    expect(calls.map((entry) => entry.operationId)).toEqual(['section.create', 'section.get'])
    expect(result).toMatchObject({
      action: 'save-section',
      mode: 'create',
      sectionId: 'section-4',
      section: {
        id: 'section-4',
        sectionUid: 'SEC-4',
        title: 'Deployment',
        kind: 'container',
        slug: 'deployment',
      },
      sectionRecord: {
        id: 'section-4',
        sectionId: 'section-4',
        title: 'Deployment',
        kind: 'container',
        slug: 'deployment',
      },
      focusSectionId: 'section-4',
    })
  })

  it('creates and links a section using reusable outline context', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'document-version.get') {
        return { item: { id: 'doc-version-1', documentId: 'document-1', title: 'Architecture v1' } }
      }
      if (operationId === 'document.get') {
        return { item: { id: 'document-1', title: 'Architecture' } }
      }
      if (operationId === 'document-section-link.list') {
        return {
          items: [
            {
              id: 'root-section-link',
              kind: 'section',
              sectionId: 'section-root',
              position: 1,
              depth: 0,
            },
          ],
        }
      }
      if (operationId === 'section.create') {
        return {
          item: {
            id: 'section-2',
            sectionUid: 'SEC-NEW',
            title: 'Architecture / Section 2',
          },
        }
      }
      if (operationId === 'document-section-link.create') {
        return {
          item: {
            id: 'link-2',
          },
        }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await createLinkedDocmanSection({
      scopeId: 'workspace-1',
      documentVersionId: 'doc-version-1',
    })

    expect(calls.map((entry) => entry.operationId)).toEqual([
      'document-version.get',
      'document.get',
      'document-section-link.list',
      'section.create',
      'document-section-link.create',
    ])
    expect(calls[3]?.input).toEqual({
      scopeId: 'workspace-1',
      data: {
        sectionUid: expect.stringMatching(/^SEC-[A-F0-9]{8}$/),
        title: 'Architecture / Section 2',
        kind: 'container',
      },
    })
    expect(calls[4]?.input).toEqual({
      scopeId: 'workspace-1',
      data: {
        documentVersionId: 'doc-version-1',
        kind: 'section',
        sectionId: 'section-2',
        parentLinkId: undefined,
        position: 2,
        depth: 0,
      },
    })
    expect(result).toMatchObject({
      action: 'create-linked-section',
      documentVersionId: 'doc-version-1',
      section: {
        id: 'section-2',
        title: 'Architecture / Section 2',
        kind: 'container',
      },
      link: {
        id: 'link-2',
        position: 2,
        depth: 0,
        kind: 'section',
      },
    })
  })

  it('creates and links a page under the resolved section link', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'document-version.get') {
        return { item: { id: 'doc-version-1', documentId: 'document-1', title: 'Architecture v1' } }
      }
      if (operationId === 'document.get') {
        return { item: { id: 'document-1', title: 'Architecture' } }
      }
      if (operationId === 'document-section-link.list') {
        return {
          items: [
            {
              id: 'section-link-3',
              kind: 'section',
              sectionId: 'section-3',
              position: 3,
              depth: 0,
            },
            {
              id: 'page-link-1',
              kind: 'page',
              pageVersionId: 'page-version-existing',
              parentLinkId: 'section-link-3',
              position: 1,
              depth: 1,
            },
          ],
        }
      }
      if (operationId === 'page.create') {
        return {
          item: {
            id: 'page-2',
            pageUid: 'PAG-NEW',
            title: 'Architecture / Section 3 / Page 2',
          },
        }
      }
      if (operationId === 'page-version.create') {
        return {
          item: {
            id: 'page-version-2',
            pageId: 'page-2',
          },
        }
      }
      if (operationId === 'document-section-link.create') {
        return {
          item: {
            id: 'page-link-2',
          },
        }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await createLinkedDocmanPage({
      scopeId: 'workspace-1',
      documentVersionId: 'doc-version-1',
      sectionId: 'section-3',
    })

    expect(calls.map((entry) => entry.operationId)).toEqual([
      'document-version.get',
      'document.get',
      'document-section-link.list',
      'page.create',
      'page-version.create',
      'document-section-link.create',
    ])
    expect(calls[3]?.input).toEqual({
      scopeId: 'workspace-1',
      data: {
        pageUid: expect.stringMatching(/^PAG-[A-F0-9]{8}$/),
        title: 'Architecture / Section 3 / Page 2',
        kind: 'content',
      },
    })
    expect(calls[5]?.input).toEqual({
      scopeId: 'workspace-1',
      data: {
        documentVersionId: 'doc-version-1',
        kind: 'page',
        pageVersionId: 'page-version-2',
        parentLinkId: 'section-link-3',
        position: 2,
        depth: 1,
      },
    })
    expect(result).toMatchObject({
      action: 'create-linked-page',
      documentVersionId: 'doc-version-1',
      sectionId: 'section-3',
      page: {
        id: 'page-2',
        title: 'Architecture / Section 3 / Page 2',
        kind: 'content',
      },
      pageVersion: {
        id: 'page-version-2',
        pageId: 'page-2',
        version: 1,
        status: 'draft',
      },
      link: {
        id: 'page-link-2',
        parentLinkId: 'section-link-3',
        position: 2,
        depth: 1,
        kind: 'page',
      },
    })
  })

  it('accepts explicit source format when creating a linked page', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'document-version.get') {
        return { item: { id: 'doc-version-1', documentId: 'document-1', title: 'Architecture v1' } }
      }
      if (operationId === 'document.get') {
        return { item: { id: 'document-1', title: 'Architecture' } }
      }
      if (operationId === 'document-section-link.list') {
        return {
          items: [
            {
              id: 'section-link-3',
              kind: 'section',
              sectionId: 'section-3',
              position: 3,
              depth: 0,
            },
          ],
        }
      }
      if (operationId === 'page.create') {
        return {
          item: {
            id: 'page-3',
            pageUid: 'PAG-3',
            title: 'Architecture / Section 3 / Page 1',
          },
        }
      }
      if (operationId === 'page-version.create') {
        return {
          item: {
            id: 'page-version-3',
            pageId: 'page-3',
            format: 'mdx',
          },
        }
      }
      if (operationId === 'document-section-link.create') {
        return { item: { id: 'page-link-3' } }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await createLinkedDocmanPage({
      scopeId: 'workspace-1',
      documentVersionId: 'doc-version-1',
      sectionId: 'section-3',
      format: 'mdx',
    })

    expect(calls[4]?.input).toEqual({
      scopeId: 'workspace-1',
      data: {
        pageId: 'page-3',
        version: 1,
        status: 'draft',
        title: 'Architecture / Section 3 / Page 1',
        format: 'mdx',
        content: '',
      },
    })
    expect(result.pageVersion).toMatchObject({
      id: 'page-version-3',
      pageId: 'page-3',
      format: 'mdx',
    })
  })

  it('links an existing section into the resolved outline branch', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []
    let documentLinkListCallCount = 0

    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'document-version.get') {
        return { item: { id: 'doc-version-1', documentId: 'document-1', title: 'Architecture v1' } }
      }
      if (operationId === 'section.get') {
        return {
          item: {
            id: 'section-4',
            sectionUid: 'SEC-4',
            title: 'Background',
            kind: 'container',
          },
        }
      }
      if (operationId === 'document-section-link.list') {
        documentLinkListCallCount += 1
        if (documentLinkListCallCount === 2) {
          return {
            items: [
              {
                id: 'root-section-link',
                kind: 'section',
                sectionId: 'section-root',
                position: 1,
                depth: 0,
              },
              {
                id: 'child-page-link',
                kind: 'page',
                parentLinkId: 'root-section-link',
                pageVersionId: 'page-version-2',
                position: 1,
                depth: 1,
              },
              {
                id: 'linked-section-4',
                kind: 'section',
                sectionId: 'section-4',
                parentLinkId: 'root-section-link',
                position: 2,
                depth: 1,
              },
            ],
          }
        }
        return {
          items: [
            {
              id: 'root-section-link',
              kind: 'section',
              sectionId: 'section-root',
              position: 1,
              depth: 0,
            },
            {
              id: 'child-page-link',
              kind: 'page',
              parentLinkId: 'root-section-link',
              pageVersionId: 'page-version-2',
              position: 1,
              depth: 1,
            },
          ],
        }
      }
      if (operationId === 'document-section-link.create') {
        return {
          item: {
            id: 'linked-section-4',
          },
        }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await linkExistingDocmanSection({
      scopeId: 'workspace-1',
      documentVersionId: 'doc-version-1',
      sectionId: 'section-4',
      parentLinkId: 'root-section-link',
    })

    expect(calls.map((entry) => entry.operationId)).toEqual([
      'document-version.get',
      'section.get',
      'document-section-link.list',
      'document-section-link.create',
      'document-section-link.list',
    ])
    expect(calls[3]?.input).toEqual({
      scopeId: 'workspace-1',
      data: {
        documentVersionId: 'doc-version-1',
        kind: 'section',
        sectionId: 'section-4',
        parentLinkId: 'root-section-link',
        position: 2,
        depth: 1,
      },
    })
    expect(result).toMatchObject({
      action: 'link-existing-section',
      documentVersionId: 'doc-version-1',
      section: {
        id: 'section-4',
        sectionUid: 'SEC-4',
        title: 'Background',
        kind: 'container',
      },
      link: {
        id: 'linked-section-4',
        parentLinkId: 'root-section-link',
        position: 2,
        depth: 1,
        kind: 'section',
      },
      documentSectionLinks: [
        {
          id: 'root-section-link',
        },
        {
          id: 'child-page-link',
        },
        {
          id: 'linked-section-4',
        },
      ],
    })
  })

  it('supports explicit outline metadata when linking an existing section', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []
    let documentLinkListCallCount = 0

    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'document-version.get') {
        return { item: { id: 'doc-version-1', documentId: 'document-1', title: 'Architecture v1' } }
      }
      if (operationId === 'section.get') {
        return {
          item: {
            id: 'section-9',
            sectionUid: 'SEC-9',
            title: 'Appendix',
            kind: 'container',
          },
        }
      }
      if (operationId === 'document-section-link.list') {
        documentLinkListCallCount += 1
        if (documentLinkListCallCount === 2) {
          return {
            items: [
              {
                id: 'link-9',
                kind: 'section',
                sectionId: 'section-9',
                position: 7,
                depth: 0,
                titleOverride: 'Appendix override',
                numbering: 'A',
              },
            ],
          }
        }
        return { items: [] }
      }
      if (operationId === 'document-section-link.create') {
        return { item: { id: 'link-9' } }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await linkExistingDocmanSection({
      scopeId: 'workspace-1',
      documentVersionId: 'doc-version-1',
      sectionId: 'section-9',
      position: 7,
      titleOverride: 'Appendix override',
      numbering: 'A',
    })

    expect(calls[3]?.input).toEqual({
      scopeId: 'workspace-1',
      data: {
        documentVersionId: 'doc-version-1',
        kind: 'section',
        sectionId: 'section-9',
        parentLinkId: undefined,
        position: 7,
        depth: 0,
        titleOverride: 'Appendix override',
        numbering: 'A',
      },
    })
    expect(result.link).toMatchObject({
      id: 'link-9',
      position: 7,
      titleOverride: 'Appendix override',
      numbering: 'A',
    })
    expect(result.documentSectionLinks).toMatchObject([
      {
        id: 'link-9',
        sectionId: 'section-9',
        position: 7,
      },
    ])
  })

  it('rejects linking the same section twice into one document outline', async () => {
    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId) => {
      if (operationId === 'document-version.get') {
        return { item: { id: 'doc-version-1', documentId: 'document-1', title: 'Architecture v1' } }
      }
      if (operationId === 'section.get') {
        return {
          item: {
            id: 'section-4',
            sectionUid: 'SEC-4',
            title: 'Background',
            kind: 'container',
          },
        }
      }
      if (operationId === 'document-section-link.list') {
        return {
          items: [
            {
              id: 'existing-link',
              kind: 'section',
              sectionId: 'section-4',
              position: 1,
              depth: 0,
            },
          ],
        }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    await expect(
      linkExistingDocmanSection({
        scopeId: 'workspace-1',
        documentVersionId: 'doc-version-1',
        sectionId: 'section-4',
      }),
    ).rejects.toThrow('Section is already linked in document outline.')
  })

  it('links the latest page version into a section when only pageId is provided', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []
    let sectionPageLinkListCallCount = 0

    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'section.get') {
        return {
          item: {
            id: 'section-3',
            sectionUid: 'SEC-3',
            title: 'Delivery',
            kind: 'container',
          },
        }
      }
      if (operationId === 'page-version.list') {
        return {
          items: [
            { id: 'page-version-1', pageId: 'page-4', version: 1, status: 'draft', title: 'Delivery v1', format: 'md' },
            { id: 'page-version-3', pageId: 'page-4', version: 3, status: 'draft', title: 'Delivery v3', format: 'md' },
            { id: 'page-version-2', pageId: 'page-4', version: 2, status: 'draft', title: 'Delivery v2', format: 'md' },
          ],
        }
      }
      if (operationId === 'section-page-link.list') {
        sectionPageLinkListCallCount += 1
        if (sectionPageLinkListCallCount === 2) {
          return {
            items: [
              { id: 'section-page-link-1', sectionId: 'section-3', pageVersionId: 'page-version-existing', position: 1, depth: 0 },
              { id: 'section-page-link-2', sectionId: 'section-3', pageVersionId: 'page-version-3', position: 2, depth: 0, titleOverride: 'Delivery overview', numbering: '2.1' },
            ],
          }
        }
        return {
          items: [
            { id: 'section-page-link-1', sectionId: 'section-3', pageVersionId: 'page-version-existing', position: 1, depth: 0 },
          ],
        }
      }
      if (operationId === 'section-page-link.create') {
        return {
          item: {
            id: 'section-page-link-2',
          },
        }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await linkExistingDocmanPageVersion({
      scopeId: 'workspace-1',
      sectionId: 'section-3',
      pageId: 'page-4',
      titleOverride: 'Delivery overview',
      numbering: '2.1',
    })

    expect(calls.map((entry) => entry.operationId)).toEqual([
      'section.get',
      'page-version.list',
      'section-page-link.list',
      'section-page-link.create',
      'section-page-link.list',
    ])
    expect(calls[3]?.input).toEqual({
      scopeId: 'workspace-1',
      data: {
        sectionId: 'section-3',
        pageVersionId: 'page-version-3',
        position: 2,
        depth: 0,
        titleOverride: 'Delivery overview',
        numbering: '2.1',
      },
    })
    expect(result).toMatchObject({
      action: 'link-existing-page-version',
      sectionId: 'section-3',
      pageVersionId: 'page-version-3',
      pageVersion: {
        id: 'page-version-3',
        pageId: 'page-4',
        version: 3,
      },
      link: {
        id: 'section-page-link-2',
        position: 2,
        depth: 0,
        titleOverride: 'Delivery overview',
        numbering: '2.1',
      },
      sectionPageLinks: [
        {
          id: 'section-page-link-1',
        },
        {
          id: 'section-page-link-2',
        },
      ],
    })
  })

  it('rejects linking the same page version twice into one section', async () => {
    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId) => {
      if (operationId === 'section.get') {
        return {
          item: {
            id: 'section-3',
            sectionUid: 'SEC-3',
            title: 'Delivery',
            kind: 'container',
          },
        }
      }
      if (operationId === 'page-version.get') {
        return {
          item: {
            id: 'page-version-3',
            pageId: 'page-4',
            version: 3,
            status: 'draft',
            title: 'Delivery v3',
            format: 'md',
          },
        }
      }
      if (operationId === 'section-page-link.list') {
        return {
          items: [
            { id: 'section-page-link-1', sectionId: 'section-3', pageVersionId: 'page-version-3', position: 1, depth: 0 },
          ],
        }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    await expect(
      linkExistingDocmanPageVersion({
        scopeId: 'workspace-1',
        sectionId: 'section-3',
        pageVersionId: 'page-version-3',
      }),
    ).rejects.toThrow('Page version is already linked in section.')
  })

  it('updates document outline links through the canonical safe sequence', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'document-section-link.list' && calls.length === 1) {
        return {
          items: [
            { id: 'root-link', kind: 'section', sectionId: 'section-root', position: 1, depth: 0 },
            { id: 'page-link-1', kind: 'page', pageVersionId: 'page-version-1', parentLinkId: 'root-link', position: 1, depth: 1 },
            { id: 'page-link-2', kind: 'page', pageVersionId: 'page-version-2', parentLinkId: 'root-link', position: 2, depth: 1 },
          ],
        }
      }
      if (operationId === 'document-section-link.list') {
        return {
          items: [
            { id: 'root-link', kind: 'section', sectionId: 'section-root', position: 1, depth: 0 },
            { id: 'page-link-2', kind: 'page', pageVersionId: 'page-version-2', parentLinkId: 'root-link', position: 1, depth: 1 },
            { id: 'page-link-1', kind: 'page', pageVersionId: 'page-version-1', parentLinkId: 'root-link', position: 2, depth: 1 },
          ],
        }
      }
      if (operationId === 'document-section-link.update') {
        return { ok: true }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await updateDocmanDocumentSectionLinksFlow({
      scopeId: 'workspace-1',
      documentVersionId: 'doc-version-1',
      updates: [
        { id: 'page-link-2', patch: { parentLinkId: 'root-link', position: 1 } },
        { id: 'page-link-1', patch: { parentLinkId: 'root-link', position: 2 } },
      ],
    })

    expect(calls.map((entry) => entry.operationId)).toEqual([
      'document-section-link.list',
      'document-section-link.update',
      'document-section-link.update',
      'document-section-link.update',
      'document-section-link.update',
      'document-section-link.list',
    ])
    expect(calls[1]?.input).toMatchObject({
      scopeId: 'workspace-1',
      id: 'page-link-2',
      patch: { parentLinkId: 'root-link' },
    })
    expect(calls[2]?.input).toMatchObject({
      scopeId: 'workspace-1',
      id: 'page-link-1',
      patch: { parentLinkId: 'root-link' },
    })
    expect(calls[3]?.input).toEqual({
      scopeId: 'workspace-1',
      id: 'page-link-2',
      patch: { parentLinkId: 'root-link', position: 1 },
    })
    expect(calls[4]?.input).toEqual({
      scopeId: 'workspace-1',
      id: 'page-link-1',
      patch: { parentLinkId: 'root-link', position: 2 },
    })
    expect(result).toMatchObject({
      action: 'update-document-section-links',
      documentVersionId: 'doc-version-1',
      updatedLinkIds: ['page-link-2', 'page-link-1'],
      documentSectionLinks: [
        { id: 'root-link' },
        { id: 'page-link-2', position: 1 },
        { id: 'page-link-1', position: 2 },
      ],
    })
  })

  it('updates section page links and returns the canonical snapshot', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'section-page-link.list' && calls.length === 1) {
        return {
          items: [
            { id: 'section-page-link-1', sectionId: 'section-1', pageVersionId: 'page-version-1', position: 1, depth: 0 },
            { id: 'section-page-link-2', sectionId: 'section-1', pageVersionId: 'page-version-2', position: 2, depth: 0 },
          ],
        }
      }
      if (operationId === 'section-page-link.list') {
        return {
          items: [
            { id: 'section-page-link-2', sectionId: 'section-1', pageVersionId: 'page-version-2', position: 1, depth: 0 },
            { id: 'section-page-link-1', sectionId: 'section-1', pageVersionId: 'page-version-1', position: 2, depth: 0 },
          ],
        }
      }
      if (operationId === 'section-page-link.update') {
        return { ok: true }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await updateDocmanSectionPageLinksFlow({
      scopeId: 'workspace-1',
      sectionId: 'section-1',
      updates: [
        { id: 'section-page-link-2', patch: { position: 1, parentLinkId: 'ignored', depth: 4 } },
        { id: 'section-page-link-1', patch: { position: 2 } },
      ],
    })

    expect(calls.map((entry) => entry.operationId)).toEqual([
      'section-page-link.list',
      'section-page-link.update',
      'section-page-link.update',
      'section-page-link.list',
    ])
    expect(calls[1]?.input).toEqual({
      scopeId: 'workspace-1',
      id: 'section-page-link-2',
      patch: { position: 1 },
    })
    expect(calls[2]?.input).toEqual({
      scopeId: 'workspace-1',
      id: 'section-page-link-1',
      patch: { position: 2 },
    })
    expect(result).toMatchObject({
      action: 'update-section-page-links',
      sectionId: 'section-1',
      updatedLinkIds: ['section-page-link-2', 'section-page-link-1'],
      sectionPageLinks: [
        { id: 'section-page-link-2', position: 1 },
        { id: 'section-page-link-1', position: 2 },
      ],
    })
  })

  it('creates a page version draft and resolves the created version', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'page-version.create') {
        return { item: { id: 'page-version-5' } }
      }
      if (operationId === 'page-version.get') {
        return {
          item: {
            id: 'page-version-5',
            pageId: 'page-7',
            version: 5,
            status: 'draft',
            title: 'Delivery v5',
            format: 'md',
          },
        }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await saveDocmanPageVersionDraftFlow({
      scopeId: 'workspace-1',
      data: {
        pageId: 'page-7',
        version: 5,
        title: 'Delivery v5',
        format: 'md',
        content: '# Delivery',
        status: 'draft',
      },
    })

    expect(calls.map((entry) => entry.operationId)).toEqual([
      'page-version.create',
      'page-version.get',
    ])
    expect(calls[0]?.input).toEqual({
      scopeId: 'workspace-1',
      data: {
        pageId: 'page-7',
        version: 5,
        title: 'Delivery v5',
        format: 'md',
        content: '# Delivery',
        status: 'draft',
      },
    })
    expect(result).toMatchObject({
      action: 'save-page-version-draft',
      mode: 'create',
      pageId: 'page-7',
      pageVersionId: 'page-version-5',
      pageVersion: {
        id: 'page-version-5',
        pageId: 'page-7',
        version: 5,
        status: 'draft',
        title: 'Delivery v5',
        format: 'md',
      },
    })
  })

  it('updates an editable page version draft through the reusable flow', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'page-version.get') {
        const versionId = (input as Record<string, unknown>)?.id
        if (versionId === 'page-version-6') {
          return {
            item: {
              id: 'page-version-6',
              pageId: 'page-7',
              version: 6,
              status: 'draft',
              title: 'Delivery v5 revised',
              format: 'md',
            },
          }
        }
        return {
          item: {
            id: 'page-version-5',
            pageId: 'page-7',
            version: 5,
            status: 'draft',
            title: 'Delivery v5',
            format: 'md',
          },
        }
      }
      if (operationId === 'document-section-link.list') {
        return {
          items: [{ id: 'doc-link-self', kind: 'page', pageVersionId: 'page-version-5', position: 1, depth: 0 }],
        }
      }
      if (operationId === 'section-page-link.list') {
        return { items: [] }
      }
      if (operationId === 'page-version.update') {
        return { ok: true }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await saveDocmanPageVersionDraftFlow({
      scopeId: 'workspace-1',
      pageVersionId: 'page-version-5',
      data: {
        pageId: 'page-7',
        version: 5,
        title: 'Delivery v5 revised',
        format: 'md',
        content: '# Revised',
        status: 'draft',
      },
    })

    expect(calls.map((entry) => entry.operationId)).toEqual([
      'page-version.get',
      'document-section-link.list',
      'section-page-link.list',
      'page-version.update',
      'page-version.get',
    ])
    expect(calls[3]?.input).toEqual({
      scopeId: 'workspace-1',
      id: 'page-version-5',
      patch: {
        pageId: 'page-7',
        version: 5,
        title: 'Delivery v5 revised',
        format: 'md',
        content: '# Revised',
        status: 'draft',
      },
    })
    expect(result).toMatchObject({
      action: 'save-page-version-draft',
      mode: 'edit',
      pageId: 'page-7',
      pageVersionId: 'page-version-5',
      pageVersion: {
        id: 'page-version-5',
        pageId: 'page-7',
        version: 5,
        status: 'draft',
      },
    })
  })

  it('forks a shared page version draft and relinks the selected document link', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'page-version.get') {
        const versionId = (input as Record<string, unknown>)?.id
        if (versionId === 'page-version-6') {
          return {
            item: {
              id: 'page-version-6',
              pageId: 'page-7',
              version: 6,
              status: 'draft',
              title: 'Delivery v5 revised',
              format: 'md',
            },
          }
        }
        return {
          item: {
            id: 'page-version-5',
            pageId: 'page-7',
            version: 5,
            status: 'draft',
            title: 'Delivery v5',
            format: 'md',
          },
        }
      }
      if (operationId === 'document-section-link.list') {
        return {
          items: [
            { id: 'doc-link-self', kind: 'page', pageVersionId: 'page-version-5', position: 1, depth: 0 },
            { id: 'doc-link-other', kind: 'page', pageVersionId: 'page-version-5', position: 2, depth: 0 },
          ],
        }
      }
      if (operationId === 'section-page-link.list') {
        return { items: [] }
      }
      if (operationId === 'page-version.list') {
        return {
          items: [
            { id: 'page-version-5', pageId: 'page-7', version: 5, status: 'draft' },
            { id: 'page-version-4', pageId: 'page-7', version: 4, status: 'draft' },
          ],
        }
      }
      if (operationId === 'page-version.create') {
        return { item: { id: 'page-version-6' } }
      }
      if (operationId === 'document-section-link.update') {
        return { ok: true }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await saveDocmanPageVersionDraftFlow({
      scopeId: 'workspace-1',
      pageVersionId: 'page-version-5',
      documentLinkId: 'doc-link-self',
      data: {
        pageId: 'page-7',
        version: 5,
        title: 'Delivery v5 revised',
        format: 'md',
        content: '# Revised',
        status: 'draft',
      },
    })

    expect(calls.map((entry) => entry.operationId)).toEqual([
      'page-version.get',
      'document-section-link.list',
      'section-page-link.list',
      'page-version.list',
      'page-version.create',
      'document-section-link.update',
      'page-version.get',
    ])
    expect(calls[4]?.input).toEqual({
      scopeId: 'workspace-1',
      data: {
        pageId: 'page-7',
        version: 6,
        title: 'Delivery v5 revised',
        format: 'md',
        content: '# Revised',
        status: 'draft',
      },
    })
    expect(calls[5]?.input).toEqual({
      scopeId: 'workspace-1',
      id: 'doc-link-self',
      patch: {
        pageVersionId: 'page-version-6',
      },
    })
    expect(result).toMatchObject({
      action: 'save-page-version-draft',
      mode: 'fork',
      pageId: 'page-7',
      pageVersionId: 'page-version-6',
      sourcePageVersionId: 'page-version-5',
      relinkedDocumentLinkId: 'doc-link-self',
      pageVersion: {
        id: 'page-version-6',
        pageId: 'page-7',
        version: 6,
        status: 'draft',
      },
    })
  })

  it('forks locked page versions into a fresh draft instead of rejecting', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'page-version.get') {
        const versionId = (input as Record<string, unknown>)?.id
        if (versionId === 'page-version-6') {
          return {
            item: {
              id: 'page-version-6',
              pageId: 'page-7',
              version: 6,
              status: 'draft',
              title: 'Delivery v5 revised',
              format: 'md',
            },
          }
        }
        return {
          item: {
            id: 'page-version-5',
            pageId: 'page-7',
            version: 5,
            status: 'published',
            title: 'Delivery v5',
            format: 'md',
          },
        }
      }
      if (operationId === 'document-section-link.list') {
        return {
          items: [{ id: 'doc-link-self', kind: 'page', pageVersionId: 'page-version-5', position: 1, depth: 0 }],
        }
      }
      if (operationId === 'section-page-link.list') {
        return { items: [] }
      }
      if (operationId === 'page-version.list') {
        return {
          items: [
            { id: 'page-version-5', pageId: 'page-7', version: 5, status: 'published' },
          ],
        }
      }
      if (operationId === 'page-version.create') {
        return { item: { id: 'page-version-6' } }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await saveDocmanPageVersionDraftFlow({
      scopeId: 'workspace-1',
      pageVersionId: 'page-version-5',
      data: {
        pageId: 'page-7',
        version: 5,
        title: 'Delivery v5 revised',
        format: 'md',
        content: '# Revised',
        status: 'draft',
      },
    })

    expect(calls.map((entry) => entry.operationId)).toEqual([
      'page-version.get',
      'document-section-link.list',
      'section-page-link.list',
      'page-version.list',
      'page-version.create',
      'page-version.get',
    ])
    expect(result).toMatchObject({
      action: 'save-page-version-draft',
      mode: 'fork',
      pageId: 'page-7',
      pageVersionId: 'page-version-6',
      sourcePageVersionId: 'page-version-5',
      pageVersion: {
        id: 'page-version-6',
        pageId: 'page-7',
        version: 6,
        status: 'draft',
      },
    })
  })

  it('rejects page nesting under another page link', async () => {
    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId) => {
      if (operationId === 'document-version.get') {
        return { item: { id: 'doc-version-1', documentId: 'document-1', title: 'Architecture v1' } }
      }
      if (operationId === 'document.get') {
        return { item: { id: 'document-1', title: 'Architecture' } }
      }
      if (operationId === 'document-section-link.list') {
        return {
          items: [
            {
              id: 'page-link-1',
              kind: 'page',
              pageVersionId: 'page-version-1',
              position: 1,
              depth: 0,
            },
          ],
        }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    await expect(
      createLinkedDocmanPage({
        scopeId: 'workspace-1',
        documentVersionId: 'doc-version-1',
        parentLinkId: 'page-link-1',
      }),
    ).rejects.toThrow('Pages cannot be nested under another page.')
  })

  it('creates a document version and clones all source links', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'document-version.create') {
        return { item: { id: 'doc-version-2', documentId: 'document-1', version: 2 } }
      }
      if (operationId === 'document-section-link.list') {
        return {
          items: [
            {
              id: 'root-link',
              kind: 'section',
              sectionId: 'section-1',
              position: 1,
              depth: 0,
              numbering: '1',
            },
            {
              id: 'child-link',
              kind: 'page',
              pageVersionId: 'page-version-1',
              parentLinkId: 'root-link',
              position: 1,
              depth: 1,
            },
          ],
        }
      }
      if (operationId === 'document-section-link.create') {
        return {
          item: {
            id: `created-${calls.filter((entry) => entry.operationId === 'document-section-link.create').length}`,
          },
        }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await createDocmanDocumentVersionFlow({
      scopeId: 'workspace-1',
      documentId: 'document-1',
      data: {
        documentId: 'document-1',
        version: 2,
        status: 'draft',
        title: 'Architecture v2',
      },
      documentInitMode: 'clone_all',
      sourceVersionId: 'doc-version-1',
    })

    expect(calls.map((entry) => entry.operationId)).toEqual([
      'document-version.create',
      'document-section-link.list',
      'document-section-link.create',
      'document-section-link.create',
    ])
    expect(calls[2]?.input).toEqual({
      scopeId: 'workspace-1',
      data: {
        documentVersionId: 'doc-version-2',
        kind: 'section',
        sectionId: 'section-1',
        pageVersionId: undefined,
        parentLinkId: undefined,
        position: 1,
        depth: 0,
        titleOverride: undefined,
        numbering: '1',
      },
    })
    expect(calls[3]?.input).toEqual({
      scopeId: 'workspace-1',
      data: {
        documentVersionId: 'doc-version-2',
        kind: 'page',
        sectionId: undefined,
        pageVersionId: 'page-version-1',
        parentLinkId: 'created-1',
        position: 1,
        depth: 1,
        titleOverride: undefined,
        numbering: undefined,
      },
    })
    expect(result).toMatchObject({
      action: 'create-document-version',
      documentId: 'document-1',
      documentVersionId: 'doc-version-2',
      documentVersion: {
        id: 'doc-version-2',
        documentId: 'document-1',
        version: 2,
        status: 'draft',
        title: 'Architecture v2',
      },
      documentSectionLinks: [
        {
          id: 'created-1',
          documentVersionId: 'doc-version-2',
          kind: 'section',
          sectionId: 'section-1',
          position: 1,
          depth: 0,
          numbering: '1',
        },
        {
          id: 'created-2',
          documentVersionId: 'doc-version-2',
          kind: 'page',
          pageVersionId: 'page-version-1',
          parentLinkId: 'created-1',
          position: 1,
          depth: 1,
        },
      ],
      focusDocumentVersionId: 'doc-version-2',
      documentInitMode: 'clone_all',
      sourceVersionId: 'doc-version-1',
      clonedLinkCount: 2,
    })
  })

  it('rejects clone_selected when nothing is selected from a non-empty source', async () => {
    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId) => {
      if (operationId === 'document-version.create') {
        return { item: { id: 'doc-version-2', documentId: 'document-1', version: 2 } }
      }
      if (operationId === 'document-section-link.list') {
        return {
          items: [
            {
              id: 'root-link',
              kind: 'section',
              sectionId: 'section-1',
              position: 1,
              depth: 0,
            },
          ],
        }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    await expect(
      createDocmanDocumentVersionFlow({
        scopeId: 'workspace-1',
        documentId: 'document-1',
        data: {
          documentId: 'document-1',
          version: 2,
        },
        documentInitMode: 'clone_selected',
        sourceVersionId: 'doc-version-1',
        sourceSectionLinkIds: [],
      }),
    ).rejects.toThrow('Select at least one section for the new version.')
  })

  it('creates a page together with its initial version', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'page.create') {
        return { item: { id: 'page-1', pageUid: 'PAG-1', title: 'Overview' } }
      }
      if (operationId === 'page-version.create') {
        return { item: { id: 'page-version-1', pageId: 'page-1' } }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await createDocmanPageWithInitialVersionFlow({
      scopeId: 'workspace-1',
      data: {
        pageUid: 'PAG-1',
        title: 'Overview',
        kind: 'content',
      },
    })

    expect(calls.map((entry) => entry.operationId)).toEqual(['page.create', 'page-version.create'])
    expect(calls[1]?.input).toEqual({
      scopeId: 'workspace-1',
      data: {
        pageId: 'page-1',
        version: 1,
        status: 'draft',
        title: 'Overview',
        format: 'md',
        content: '',
      },
    })
    expect(result).toMatchObject({
      action: 'create-page-with-initial-version',
      page: {
        id: 'page-1',
        pageUid: 'PAG-1',
        title: 'Overview',
        kind: 'content',
      },
      pageVersionId: 'page-version-1',
      pageVersion: {
        id: 'page-version-1',
        pageId: 'page-1',
        version: 1,
        status: 'draft',
        title: 'Overview',
        format: 'md',
        content: '',
      },
      focusPageVersionId: 'page-version-1',
      hasPageVersion: true,
      pageVersionError: '',
    })
  })

  it('keeps the page create payload clean while seeding the initial page-version format', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'page.create') {
        return {
          item: {
            id: 'page-2',
            pageUid: 'PAG-2',
            title: 'Guide',
            kind: 'content',
          },
        }
      }
      if (operationId === 'page-version.create') {
        return {
          item: {
            id: 'page-version-2',
            pageId: 'page-2',
            format: 'mdx',
          },
        }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await createDocmanPageWithInitialVersionFlow({
      scopeId: 'workspace-1',
      data: {
        pageUid: 'PAG-2',
        title: 'Guide',
        kind: 'content',
        format: 'mdx',
      },
    })

    expect(calls[0]?.input).toEqual({
      scopeId: 'workspace-1',
      data: {
        pageUid: 'PAG-2',
        title: 'Guide',
        kind: 'content',
      },
    })
    expect(calls[1]?.input).toEqual({
      scopeId: 'workspace-1',
      data: {
        pageId: 'page-2',
        version: 1,
        status: 'draft',
        title: 'Guide',
        format: 'mdx',
        content: '',
      },
    })
    expect(result.pageVersion).toMatchObject({
      id: 'page-version-2',
      pageId: 'page-2',
      format: 'mdx',
    })
  })

  it('updates a document version and returns the normalized snapshot', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'document-version.update') {
        return { ok: true }
      }
      if (operationId === 'document-version.get') {
        return {
          item: {
            id: 'doc-version-2',
            documentId: 'document-1',
            version: 2,
            status: 'published',
            title: 'Architecture v2',
            summary: 'Updated summary',
          },
        }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await updateDocmanDocumentVersionFlow({
      scopeId: 'workspace-1',
      documentVersionId: 'doc-version-2',
      documentId: 'document-1',
      data: {
        status: 'published',
        title: 'Architecture v2',
        summary: 'Updated summary',
      },
    })

    expect(calls.map((entry) => entry.operationId)).toEqual([
      'document-version.update',
      'document-version.get',
    ])
    expect(calls[0]?.input).toEqual({
      scopeId: 'workspace-1',
      id: 'doc-version-2',
      patch: {
        status: 'published',
        title: 'Architecture v2',
        summary: 'Updated summary',
      },
    })
    expect(result).toMatchObject({
      action: 'update-document-version',
      documentId: 'document-1',
      documentVersionId: 'doc-version-2',
      documentVersion: {
        id: 'doc-version-2',
        documentId: 'document-1',
        version: 2,
        status: 'published',
        title: 'Architecture v2',
        summary: 'Updated summary',
      },
      focusDocumentVersionId: 'doc-version-2',
    })
  })

  it('updates a page and returns the normalized snapshot', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'page.update') {
        return { ok: true }
      }
      if (operationId === 'page.get') {
        return {
          item: {
            id: 'page-3',
            pageUid: 'PAG-3',
            title: 'Runbook',
            kind: 'content',
          },
        }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await updateDocmanPageFlow({
      scopeId: 'workspace-1',
      pageId: 'page-3',
      data: {
        title: 'Runbook',
        kind: 'content',
      },
    })

    expect(calls.map((entry) => entry.operationId)).toEqual(['page.update', 'page.get'])
    expect(calls[0]?.input).toEqual({
      scopeId: 'workspace-1',
      id: 'page-3',
      patch: {
        title: 'Runbook',
        kind: 'content',
      },
    })
    expect(result).toMatchObject({
      action: 'update-page',
      pageId: 'page-3',
      page: {
        id: 'page-3',
        pageUid: 'PAG-3',
        title: 'Runbook',
        kind: 'content',
      },
      focusPageId: 'page-3',
    })
  })

  it('copies a section by reusing page-version links and linking the new section into the target document version', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'document-version.get') {
        return { item: { id: 'docver-2', documentId: 'doc-1', version: 2 } }
      }
      if (operationId === 'section.get') {
        return { item: { id: 'section-1', sectionUid: 'SEC-1', title: 'Source Section', kind: 'container' } }
      }
      if (operationId === 'document-section-link.list') {
        return { items: [{ id: 'parent-link', sectionId: 'section-parent', position: 1, depth: 0 }] }
      }
      if (operationId === 'section.create') {
        return { item: { id: 'section-copy' } }
      }
      if (operationId === 'section-page-link.list') {
        return {
          items: [
            { id: 'spl-1', sectionId: 'section-1', pageVersionId: 'pagever-1', position: 1, depth: 0 },
            { id: 'spl-2', sectionId: 'section-1', pageVersionId: 'pagever-2', position: 2, depth: 0 },
          ],
        }
      }
      if (operationId === 'section-page-link.create') {
        return { item: { id: `copy-${calls.length}` } }
      }
      if (operationId === 'document-section-link.create') {
        return { item: { id: 'doclink-copy' } }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await copyDocmanSectionFlow({
      scopeId: 'workspace-1',
      sourceSectionId: 'section-1',
      targetDocumentVersionId: 'docver-2',
      parentLinkId: 'parent-link',
      position: 5,
      rename: 'Copied Section',
    })

    expect(calls.map((entry) => entry.operationId)).toEqual([
      'document-version.get',
      'section.get',
      'document-section-link.list',
      'section.create',
      'section-page-link.list',
      'section-page-link.create',
      'section-page-link.create',
      'document-section-link.create',
    ])
    expect(calls[3]?.input).toMatchObject({
      scopeId: 'workspace-1',
      data: { title: 'Copied Section', kind: 'container' },
    })
    expect(calls[5]?.input).toMatchObject({
      scopeId: 'workspace-1',
      data: { sectionId: 'section-copy', pageVersionId: 'pagever-1', position: 1 },
    })
    expect(calls[7]?.input).toMatchObject({
      scopeId: 'workspace-1',
      data: {
        documentVersionId: 'docver-2',
        kind: 'section',
        sectionId: 'section-copy',
        parentLinkId: 'parent-link',
        position: 5,
        depth: 1,
        titleOverride: 'Copied Section',
      },
    })
    expect(result).toMatchObject({
      action: 'copy-section',
      mode: 'reuse-pages',
      sectionId: 'section-copy',
      documentSectionLink: { id: 'doclink-copy', position: 5, depth: 1 },
      sectionPageLinks: [
        { sectionId: 'section-copy', pageVersionId: 'pagever-1' },
        { sectionId: 'section-copy', pageVersionId: 'pagever-2' },
      ],
    })
  })

  it('copies a section by cloning source pages and page versions when clonePages is true', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'document-version.get') {
        return { item: { id: 'docver-2', documentId: 'doc-1', version: 2 } }
      }
      if (operationId === 'section.get') {
        return { item: { id: 'section-1', sectionUid: 'SEC-1', title: 'Source Section', kind: 'container' } }
      }
      if (operationId === 'document-section-link.list') {
        return { items: [] }
      }
      if (operationId === 'section.create') {
        return { item: { id: 'section-copy' } }
      }
      if (operationId === 'section-page-link.list') {
        return { items: [{ id: 'spl-1', sectionId: 'section-1', pageVersionId: 'pagever-1', position: 1, depth: 0 }] }
      }
      if (operationId === 'page-version.get') {
        return {
          item: {
            id: 'pagever-1',
            pageId: 'page-1',
            version: 3,
            status: 'published',
            title: 'Runbook v3',
            format: 'md',
            content: '# Runbook',
          },
        }
      }
      if (operationId === 'page.get') {
        return { item: { id: 'page-1', pageUid: 'PAG-1', title: 'Runbook', kind: 'content' } }
      }
      if (operationId === 'page.create') {
        return { item: { id: 'page-copy' } }
      }
      if (operationId === 'page-version.create') {
        return { item: { id: 'pagever-copy' } }
      }
      if (operationId === 'section-page-link.create') {
        return { item: { id: 'spl-copy' } }
      }
      if (operationId === 'document-section-link.create') {
        return { item: { id: 'doclink-copy' } }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await copyDocmanSectionFlow({
      scopeId: 'workspace-1',
      sourceSectionId: 'section-1',
      targetDocumentVersionId: 'docver-2',
      clonePages: true,
    })

    expect(calls.map((entry) => entry.operationId)).toEqual([
      'document-version.get',
      'section.get',
      'document-section-link.list',
      'section.create',
      'section-page-link.list',
      'page-version.get',
      'page.get',
      'page.create',
      'page-version.create',
      'section-page-link.create',
      'document-section-link.create',
    ])
    expect(calls[7]?.input).toMatchObject({
      scopeId: 'workspace-1',
      data: { title: 'Runbook', kind: 'content' },
    })
    expect(calls[8]?.input).toMatchObject({
      scopeId: 'workspace-1',
      data: { pageId: 'page-copy', version: 1, status: 'published', title: 'Runbook v3', content: '# Runbook' },
    })
    expect(calls[9]?.input).toMatchObject({
      scopeId: 'workspace-1',
      data: { sectionId: 'section-copy', pageVersionId: 'pagever-copy' },
    })
    expect(result).toMatchObject({
      action: 'copy-section',
      mode: 'clone-pages',
      clonedPages: [{ sourcePageVersionId: 'pagever-1' }],
      sectionPageLinks: [{ sectionId: 'section-copy', pageVersionId: 'pagever-copy' }],
    })
  })

  it('copies a page by reusing the latest source page-version when sourcePageVersionId is omitted', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'section.get') {
        return { item: { id: 'section-target', sectionUid: 'SEC-T', title: 'Target', kind: 'container' } }
      }
      if (operationId === 'page-version.list') {
        return {
          items: [
            { id: 'pagever-1', pageId: 'page-1', version: 1, title: 'Page v1', format: 'md' },
            { id: 'pagever-3', pageId: 'page-1', version: 3, title: 'Page v3', format: 'md' },
          ],
        }
      }
      if (operationId === 'section-page-link.list') {
        return { items: [] }
      }
      if (operationId === 'section-page-link.create') {
        return { item: { id: 'spl-copy' } }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await copyDocmanPageFlow({
      scopeId: 'workspace-1',
      sourcePageId: 'page-1',
      targetSectionId: 'section-target',
      position: 9,
      rename: 'Linked Title',
    })

    expect(calls.map((entry) => entry.operationId)).toEqual([
      'section.get',
      'page-version.list',
      'section-page-link.list',
      'section-page-link.create',
    ])
    expect(calls[3]?.input).toMatchObject({
      scopeId: 'workspace-1',
      data: {
        sectionId: 'section-target',
        pageVersionId: 'pagever-3',
        position: 9,
        depth: 0,
        titleOverride: 'Linked Title',
      },
    })
    expect(result).toMatchObject({
      action: 'copy-page',
      mode: 'reuse-page',
      sourcePageId: 'page-1',
      pageVersionId: 'pagever-3',
      link: { id: 'spl-copy', titleOverride: 'Linked Title' },
    })
  })

  it('copies a page by cloning page metadata and selected page-version content when clonePage is true', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'section.get') {
        return { item: { id: 'section-target', sectionUid: 'SEC-T', title: 'Target', kind: 'container' } }
      }
      if (operationId === 'page-version.get') {
        return {
          item: {
            id: 'pagever-2',
            pageId: 'page-1',
            version: 2,
            status: 'draft',
            title: 'Source Version',
            format: 'mdx',
            content: '# Source',
          },
        }
      }
      if (operationId === 'page.get') {
        return { item: { id: 'page-1', pageUid: 'PAG-1', title: 'Source Page', kind: 'content' } }
      }
      if (operationId === 'page.create') {
        return { item: { id: 'page-copy' } }
      }
      if (operationId === 'page-version.create') {
        return { item: { id: 'pagever-copy' } }
      }
      if (operationId === 'section-page-link.list') {
        return { items: [] }
      }
      if (operationId === 'section-page-link.create') {
        return { item: { id: 'spl-copy' } }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await copyDocmanPageFlow({
      scopeId: 'workspace-1',
      sourcePageId: 'page-1',
      sourcePageVersionId: 'pagever-2',
      targetSectionId: 'section-target',
      clonePage: true,
      rename: 'Cloned Page',
    })

    expect(calls.map((entry) => entry.operationId)).toEqual([
      'section.get',
      'page-version.get',
      'page.get',
      'page.create',
      'page-version.create',
      'section-page-link.list',
      'section-page-link.create',
    ])
    expect(calls[3]?.input).toMatchObject({
      scopeId: 'workspace-1',
      data: { title: 'Cloned Page', kind: 'content' },
    })
    expect(calls[4]?.input).toMatchObject({
      scopeId: 'workspace-1',
      data: {
        pageId: 'page-copy',
        version: 1,
        status: 'draft',
        title: 'Cloned Page',
        format: 'mdx',
        content: '# Source',
      },
    })
    expect(calls[6]?.input).toMatchObject({
      scopeId: 'workspace-1',
      data: { sectionId: 'section-target', pageVersionId: 'pagever-copy' },
    })
    expect(result).toMatchObject({
      action: 'copy-page',
      mode: 'clone-page',
      pageId: 'page-copy',
      pageVersionId: 'pagever-copy',
      link: { id: 'spl-copy', titleOverride: '' },
    })
  })

  it('returns partial success when initial version creation fails', async () => {
    mocks.runDocmanKitOperationByTypedId.mockImplementation(async (operationId) => {
      if (operationId === 'page.create') {
        return { item: { id: 'page-1', pageUid: 'PAG-1', title: 'Overview' } }
      }
      if (operationId === 'page-version.create') {
        throw new Error('Failed to create initial page version.')
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await createDocmanPageWithInitialVersionFlow({
      scopeId: 'workspace-1',
      data: {
        pageUid: 'PAG-1',
        title: 'Overview',
      },
    })

    expect(result).toMatchObject({
      action: 'create-page-with-initial-version',
      page: {
        id: 'page-1',
        pageUid: 'PAG-1',
        title: 'Overview',
      },
      pageVersionId: '',
      hasPageVersion: false,
      pageVersionError: 'Failed to create initial page version.',
    })
  })
})
