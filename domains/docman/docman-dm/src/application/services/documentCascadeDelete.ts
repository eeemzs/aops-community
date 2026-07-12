import { Effect } from 'effect'
import { XfErrorFactory } from '@aopslab/xf-core'
import { mapDbError } from '@aopslab/xf-db'
import type {
  IRepositoryPortDocument,
  IRepositoryPortDocumentSectionLink,
  IRepositoryPortDocumentVersion,
  IRepositoryPortPage,
  IRepositoryPortPageEmbedLink,
  IRepositoryPortPageSnippetLink,
  IRepositoryPortPageVersion,
  IRepositoryPortSection,
  IRepositoryPortSectionPageLink,
} from '../ports/repository-ports/index.js'

export interface DocmanCascadeDeleteDependencies {
  documentRepository: IRepositoryPortDocument
  documentVersionRepository: IRepositoryPortDocumentVersion
  documentSectionLinkRepository: IRepositoryPortDocumentSectionLink
  sectionRepository: IRepositoryPortSection
  pageRepository: IRepositoryPortPage
  pageVersionRepository: IRepositoryPortPageVersion
  sectionPageLinkRepository: IRepositoryPortSectionPageLink
  pageSnippetLinkRepository: IRepositoryPortPageSnippetLink
  pageEmbedLinkRepository: IRepositoryPortPageEmbedLink
}

export interface DocmanCascadeDeleteCounters {
  documents: number
  documentVersions: number
  documentSectionLinks: number
  sections: number
  sectionPageLinks: number
  pageVersions: number
  pages: number
  pageSnippetLinks: number
  pageEmbedLinks: number
}

export interface DocmanCascadeDeletePreserved {
  sectionsInUse: number
  sectionIdsInUse: string[]
  pageVersionsInUse: number
  pageIdsWithRemainingVersions: number
  pageVersionIdsInUse: string[]
  pageIdsWithRemainingVersionsList: string[]
}

export interface DocmanCascadeDeleteReport {
  deleted: DocmanCascadeDeleteCounters
  preserved: DocmanCascadeDeletePreserved
  deletedDocumentVersionIds: string[]
}

export interface DocmanDocumentDeleteReport extends DocmanCascadeDeleteReport {
  documentId: string
}

export interface DocmanDocumentVersionDeleteReport extends DocmanCascadeDeleteReport {
  documentId: string
  documentVersionId: string
}

type RepoWithDeleteById = {
  deleteById: (id: string) => Effect.Effect<number, unknown>
}

type RepoWithFind<T> = {
  find: (match: any, options?: any) => Effect.Effect<T[], unknown>
}

type RepoWithFindById<T> = {
  findById: (id: string, options?: any) => Effect.Effect<T, unknown>
}

function createEmptyCounters(): DocmanCascadeDeleteCounters {
  return {
    documents: 0,
    documentVersions: 0,
    documentSectionLinks: 0,
    sections: 0,
    sectionPageLinks: 0,
    pageVersions: 0,
    pages: 0,
    pageSnippetLinks: 0,
    pageEmbedLinks: 0,
  }
}

function createEmptyPreserved(): DocmanCascadeDeletePreserved {
  return {
    sectionsInUse: 0,
    sectionIdsInUse: [],
    pageVersionsInUse: 0,
    pageIdsWithRemainingVersions: 0,
    pageVersionIdsInUse: [],
    pageIdsWithRemainingVersionsList: [],
  }
}

function createEmptyReport(): DocmanCascadeDeleteReport {
  return {
    deleted: createEmptyCounters(),
    preserved: createEmptyPreserved(),
    deletedDocumentVersionIds: [],
  }
}

function toUniqueIds(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)))
}

function findByMatchEq<T>(
  repo: RepoWithFind<T>,
  matchEq: Record<string, unknown>,
  stage: string,
  operation: string,
): Effect.Effect<T[], unknown> {
  return repo
    .find({ matchEq } as any)
    .pipe(Effect.mapError(mapDbError({ stage, operation, factory: XfErrorFactory.notFound })))
}

function findById<T>(
  repo: RepoWithFindById<T>,
  id: string,
  stage: string,
  operation: string,
): Effect.Effect<T, unknown> {
  return repo
    .findById(id)
    .pipe(Effect.mapError(mapDbError({ stage, operation, factory: XfErrorFactory.notFound })))
}

function deleteRowsByIds(
  repo: RepoWithDeleteById,
  ids: Array<string | null | undefined>,
  stage: string,
  operation: string,
): Effect.Effect<number, unknown> {
  const uniqueIds = toUniqueIds(ids)
  if (uniqueIds.length === 0) return Effect.succeed(0)

  return Effect.gen(function* (_) {
    let deleted = 0
    for (const id of uniqueIds) {
      deleted += yield* _(
        repo
          .deleteById(id)
          .pipe(Effect.mapError(mapDbError({ stage, operation, factory: XfErrorFactory.upsertFailed })))
      )
    }
    return deleted
  })
}

function applyPreservedSets(
  report: DocmanCascadeDeleteReport,
  sets: {
    sectionIdsInUse: Set<string>
    pageVersionIdsInUse: Set<string>
    pageIdsWithRemainingVersions: Set<string>
  },
) {
  report.preserved.sectionIdsInUse = Array.from(sets.sectionIdsInUse)
  report.preserved.pageVersionIdsInUse = Array.from(sets.pageVersionIdsInUse)
  report.preserved.pageIdsWithRemainingVersionsList = Array.from(sets.pageIdsWithRemainingVersions)

  report.preserved.sectionsInUse = report.preserved.sectionIdsInUse.length
  report.preserved.pageVersionsInUse = report.preserved.pageVersionIdsInUse.length
  report.preserved.pageIdsWithRemainingVersions = report.preserved.pageIdsWithRemainingVersionsList.length
}

function extractPageId(value: unknown): string {
  return typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).pageId === 'string'
    ? ((value as Record<string, unknown>).pageId as string)
    : ''
}

function extractPageVersionId(value: unknown): string {
  return typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).pageVersionId === 'string'
    ? ((value as Record<string, unknown>).pageVersionId as string)
    : ''
}

function extractRecordId(value: unknown): string {
  return typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).id === 'string'
    ? ((value as Record<string, unknown>).id as string)
    : ''
}

export function deleteDocumentVersionsCascade(
  dependencies: DocmanCascadeDeleteDependencies,
  documentVersionIds: Array<string | null | undefined>,
  stage = 'DocmanCascadeDelete::deleteDocumentVersionsCascade',
): Effect.Effect<DocmanCascadeDeleteReport, unknown, unknown> {
  const uniqueDocumentVersionIds = toUniqueIds(documentVersionIds)

  return Effect.gen(function* (_) {
    const report = createEmptyReport()
    if (uniqueDocumentVersionIds.length === 0) return report

    const sectionCandidateIds = new Set<string>()
    const pageVersionCandidateIds = new Set<string>()
    const touchedPageIds = new Set<string>()

    const sectionIdsInUse = new Set<string>()
    const pageVersionIdsInUse = new Set<string>()
    const pageIdsWithRemainingVersions = new Set<string>()

    for (const documentVersionId of uniqueDocumentVersionIds) {
      const links = yield* _(
        findByMatchEq(
          dependencies.documentSectionLinkRepository,
          { documentVersionId },
          stage,
          'documentSectionLinkRepository.find(documentVersionId)'
        )
      )

      for (const link of links as Array<Record<string, unknown>>) {
        const kind = String(link.kind ?? '').trim()
        if (kind === 'section' && typeof link.sectionId === 'string') {
          sectionCandidateIds.add(link.sectionId)
        }
        if (kind === 'page' && typeof link.pageVersionId === 'string') {
          pageVersionCandidateIds.add(link.pageVersionId)
        }
      }

      report.deleted.documentSectionLinks += yield* _(
        deleteRowsByIds(
          dependencies.documentSectionLinkRepository,
          links.map((link: any) => link.id),
          stage,
          'documentSectionLinkRepository.deleteById'
        )
      )
    }

    for (const sectionId of sectionCandidateIds) {
      const remainingLinks = yield* _(
        findByMatchEq(
          dependencies.documentSectionLinkRepository,
          { sectionId },
          stage,
          'documentSectionLinkRepository.find(sectionId)'
        )
      )

      if (remainingLinks.length > 0) {
        sectionIdsInUse.add(sectionId)
        continue
      }

      const sectionPageLinks = yield* _(
        findByMatchEq(
          dependencies.sectionPageLinkRepository,
          { sectionId },
          stage,
          'sectionPageLinkRepository.find(sectionId)'
        )
      )

      for (const link of sectionPageLinks as Array<Record<string, unknown>>) {
        const pageVersionId = extractPageVersionId(link)
        if (pageVersionId) pageVersionCandidateIds.add(pageVersionId)
      }

      report.deleted.sectionPageLinks += yield* _(
        deleteRowsByIds(
          dependencies.sectionPageLinkRepository,
          sectionPageLinks.map((link: any) => link.id),
          stage,
          'sectionPageLinkRepository.deleteById'
        )
      )

      report.deleted.sections += yield* _(
        deleteRowsByIds(
          dependencies.sectionRepository,
          [sectionId],
          stage,
          'sectionRepository.deleteById'
        )
      )
    }

    for (const pageVersionId of pageVersionCandidateIds) {
      const [remainingDocumentLinks, remainingSectionLinks] = yield* _(
        Effect.all([
          findByMatchEq(
            dependencies.documentSectionLinkRepository,
            { pageVersionId },
            stage,
            'documentSectionLinkRepository.find(pageVersionId)'
          ),
          findByMatchEq(
            dependencies.sectionPageLinkRepository,
            { pageVersionId },
            stage,
            'sectionPageLinkRepository.find(pageVersionId)'
          ),
        ])
      )

      if (remainingDocumentLinks.length > 0 || remainingSectionLinks.length > 0) {
        pageVersionIdsInUse.add(pageVersionId)
        continue
      }

      const pageVersion = (yield* _(
        findById(
          dependencies.pageVersionRepository,
          pageVersionId,
          stage,
          'pageVersionRepository.findById'
        )
      )) as Record<string, unknown>

      const pageId = extractPageId(pageVersion)
      if (pageId) touchedPageIds.add(pageId)

      const pageSnippetLinks = yield* _(
        findByMatchEq(
          dependencies.pageSnippetLinkRepository,
          { pageVersionId },
          stage,
          'pageSnippetLinkRepository.find(pageVersionId)'
        )
      )
      report.deleted.pageSnippetLinks += yield* _(
        deleteRowsByIds(
          dependencies.pageSnippetLinkRepository,
          pageSnippetLinks.map((link: any) => link.id),
          stage,
          'pageSnippetLinkRepository.deleteById'
        )
      )

      const pageEmbedLinks = yield* _(
        findByMatchEq(
          dependencies.pageEmbedLinkRepository,
          { pageVersionId },
          stage,
          'pageEmbedLinkRepository.find(pageVersionId)'
        )
      )
      report.deleted.pageEmbedLinks += yield* _(
        deleteRowsByIds(
          dependencies.pageEmbedLinkRepository,
          pageEmbedLinks.map((link: any) => link.id),
          stage,
          'pageEmbedLinkRepository.deleteById'
        )
      )

      report.deleted.pageVersions += yield* _(
        deleteRowsByIds(
          dependencies.pageVersionRepository,
          [pageVersionId],
          stage,
          'pageVersionRepository.deleteById'
        )
      )
    }

    for (const pageId of touchedPageIds) {
      const remainingPageVersions = yield* _(
        findByMatchEq(
          dependencies.pageVersionRepository,
          { pageId },
          stage,
          'pageVersionRepository.find(pageId)'
        )
      )

      let hasLiveRemainingVersion = false

      for (const pageVersion of remainingPageVersions as Array<Record<string, unknown>>) {
        const remainingPageVersionId = extractRecordId(pageVersion)
        if (!remainingPageVersionId) continue

        const [remainingDocumentLinks, remainingSectionLinks] = yield* _(
          Effect.all([
            findByMatchEq(
              dependencies.documentSectionLinkRepository,
              { pageVersionId: remainingPageVersionId },
              stage,
              'documentSectionLinkRepository.find(pageVersionId::pageSweep)'
            ),
            findByMatchEq(
              dependencies.sectionPageLinkRepository,
              { pageVersionId: remainingPageVersionId },
              stage,
              'sectionPageLinkRepository.find(pageVersionId::pageSweep)'
            ),
          ])
        )

        if (remainingDocumentLinks.length > 0 || remainingSectionLinks.length > 0) {
          hasLiveRemainingVersion = true
          continue
        }

        const orphanSnippetLinks = yield* _(
          findByMatchEq(
            dependencies.pageSnippetLinkRepository,
            { pageVersionId: remainingPageVersionId },
            stage,
            'pageSnippetLinkRepository.find(pageVersionId::pageSweep)'
          )
        )
        report.deleted.pageSnippetLinks += yield* _(
          deleteRowsByIds(
            dependencies.pageSnippetLinkRepository,
            orphanSnippetLinks.map((link: any) => link.id),
            stage,
            'pageSnippetLinkRepository.deleteById::pageSweep'
          )
        )

        const orphanEmbedLinks = yield* _(
          findByMatchEq(
            dependencies.pageEmbedLinkRepository,
            { pageVersionId: remainingPageVersionId },
            stage,
            'pageEmbedLinkRepository.find(pageVersionId::pageSweep)'
          )
        )
        report.deleted.pageEmbedLinks += yield* _(
          deleteRowsByIds(
            dependencies.pageEmbedLinkRepository,
            orphanEmbedLinks.map((link: any) => link.id),
            stage,
            'pageEmbedLinkRepository.deleteById::pageSweep'
          )
        )

        report.deleted.pageVersions += yield* _(
          deleteRowsByIds(
            dependencies.pageVersionRepository,
            [remainingPageVersionId],
            stage,
            'pageVersionRepository.deleteById::pageSweep'
          )
        )
      }

      const finalRemainingPageVersions = yield* _(
        findByMatchEq(
          dependencies.pageVersionRepository,
          { pageId },
          stage,
          'pageVersionRepository.find(pageId::afterSweep)'
        )
      )

      if (hasLiveRemainingVersion || finalRemainingPageVersions.length > 0) {
        pageIdsWithRemainingVersions.add(pageId)
        continue
      }

      report.deleted.pages += yield* _(
        deleteRowsByIds(
          dependencies.pageRepository,
          [pageId],
          stage,
          'pageRepository.deleteById'
        )
      )
    }

    report.deleted.documentVersions += yield* _(
      deleteRowsByIds(
        dependencies.documentVersionRepository,
        uniqueDocumentVersionIds,
        stage,
        'documentVersionRepository.deleteById'
      )
    )
    report.deletedDocumentVersionIds = uniqueDocumentVersionIds

    applyPreservedSets(report, {
      sectionIdsInUse,
      pageVersionIdsInUse,
      pageIdsWithRemainingVersions,
    })

    return report
  })
}

export function deleteDocumentCascade(
  dependencies: DocmanCascadeDeleteDependencies,
  documentId: string,
  stage = 'DocmanCascadeDelete::deleteDocumentCascade',
): Effect.Effect<DocmanDocumentDeleteReport, unknown, unknown> {
  return Effect.gen(function* (_) {
    const documentVersions = yield* _(
      findByMatchEq(
        dependencies.documentVersionRepository,
        { documentId },
        stage,
        'documentVersionRepository.find(documentId)'
      )
    )

    const cascadeReport = yield* _(
      deleteDocumentVersionsCascade(
        dependencies,
        documentVersions.map((version: any) => version.id),
        `${stage}::versions`
      )
    )

    cascadeReport.deleted.documents += yield* _(
      deleteRowsByIds(
        dependencies.documentRepository,
        [documentId],
        stage,
        'documentRepository.deleteById'
      )
    )

    return {
      ...cascadeReport,
      documentId,
    }
  })
}

export function deleteDocumentVersionCascade(
  dependencies: DocmanCascadeDeleteDependencies,
  documentVersionId: string,
  stage = 'DocmanCascadeDelete::deleteDocumentVersionCascade',
): Effect.Effect<DocmanDocumentVersionDeleteReport, unknown, unknown> {
  return Effect.gen(function* (_) {
    const documentVersion = (yield* _(
      findById(
        dependencies.documentVersionRepository,
        documentVersionId,
        stage,
        'documentVersionRepository.findById'
      )
    )) as Record<string, unknown>

    const cascadeReport = yield* _(
      deleteDocumentVersionsCascade(dependencies, [documentVersionId], `${stage}::versions`)
    )

    return {
      ...cascadeReport,
      documentVersionId,
      documentId: String(documentVersion.documentId ?? ''),
    }
  })
}
