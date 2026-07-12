import { createHash } from 'node:crypto'

const DOCMAN_LOCAL_EMBEDDING_PROVIDER = 'docman-local-hash-v1'
const DOCMAN_LOCAL_EMBEDDING_MODEL = 'hash-256'
const DOCMAN_LOCAL_EMBEDDING_DIMENSIONS = 256

export type DocmanEmbeddingProviderResult = {
  provider: string
  model: string
  dimensions: number
  vectors: number[][]
}

export type DocmanEmbeddingProvider = {
  provider: string
  model: string
  dimensions?: number
  embedMany(input: { texts: readonly string[] }): Promise<DocmanEmbeddingProviderResult>
}

function normalizeText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeEmbeddingText(value: unknown): string {
  return normalizeText(value).toLowerCase()
}

function buildStableBucket(seed: string, dimensions: number): { index: number; sign: number } {
  const digest = createHash('sha1').update(seed).digest()
  const index = digest.readUInt32BE(0) % dimensions
  const sign = digest[4] % 2 === 0 ? 1 : -1
  return { index, sign }
}

function normalizeVector(input: readonly number[]): number[] {
  const magnitude = Math.sqrt(input.reduce((sum, value) => sum + value * value, 0))
  if (!Number.isFinite(magnitude) || magnitude <= 0) {
    return Array.from({ length: input.length }, () => 0)
  }
  return input.map((value) => Number((value / magnitude).toFixed(8)))
}

function listWordTokens(value: string): string[] {
  return [...new Set(value.split(/\s+/).map((token) => token.trim()).filter(Boolean))]
}

function listCharacterNgrams(value: string, size = 3): string[] {
  const compact = value.replace(/\s+/g, ' ')
  if (compact.length < size) {
    return compact ? [compact] : []
  }
  const output = new Set<string>()
  for (let index = 0; index <= compact.length - size; index += 1) {
    output.add(compact.slice(index, index + size))
  }
  return [...output]
}

export function buildDocmanEmbeddingHash(value: string): string {
  return createHash('sha256').update(normalizeEmbeddingText(value)).digest('hex')
}

export function serializeDocmanEmbeddingVector(vector: readonly number[]): string {
  return JSON.stringify(vector.map((value) => Number(Number(value).toFixed(8))))
}

export function parseDocmanEmbeddingVector(value: unknown): number[] | undefined {
  const raw = normalizeText(value)
  if (!raw) return undefined

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return undefined
    const numbers = parsed
      .map((entry) => Number(entry))
      .filter((entry) => Number.isFinite(entry))
    return numbers.length === parsed.length && numbers.length > 0 ? numbers : undefined
  } catch {
    return undefined
  }
}

export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (!left.length || !right.length || left.length !== right.length) return 0
  let sum = 0
  let leftMagnitude = 0
  let rightMagnitude = 0
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = Number(left[index] ?? 0)
    const rightValue = Number(right[index] ?? 0)
    sum += leftValue * rightValue
    leftMagnitude += leftValue * leftValue
    rightMagnitude += rightValue * rightValue
  }
  if (leftMagnitude <= 0 || rightMagnitude <= 0) return 0
  return sum / Math.sqrt(leftMagnitude * rightMagnitude)
}

export function buildDocmanLocalHashVector(value: string, dimensions = DOCMAN_LOCAL_EMBEDDING_DIMENSIONS): number[] {
  const normalized = normalizeEmbeddingText(value)
  if (!normalized) {
    return Array.from({ length: dimensions }, () => 0)
  }

  const vector = Array.from({ length: dimensions }, () => 0)
  const tokens = listWordTokens(normalized)
  const ngrams = listCharacterNgrams(normalized, 3)

  for (const token of tokens) {
    const { index, sign } = buildStableBucket(`token:${token}`, dimensions)
    vector[index] += 2.4 * sign
  }

  for (const ngram of ngrams) {
    const { index, sign } = buildStableBucket(`ngram:${ngram}`, dimensions)
    vector[index] += 0.8 * sign
  }

  return normalizeVector(vector)
}

export function createDocmanLocalHashEmbeddingProvider(): DocmanEmbeddingProvider {
  return {
    provider: DOCMAN_LOCAL_EMBEDDING_PROVIDER,
    model: DOCMAN_LOCAL_EMBEDDING_MODEL,
    dimensions: DOCMAN_LOCAL_EMBEDDING_DIMENSIONS,
    async embedMany(input) {
      const texts = Array.isArray(input.texts) ? input.texts : []
      return {
        provider: DOCMAN_LOCAL_EMBEDDING_PROVIDER,
        model: DOCMAN_LOCAL_EMBEDDING_MODEL,
        dimensions: DOCMAN_LOCAL_EMBEDDING_DIMENSIONS,
        vectors: texts.map((text) => buildDocmanLocalHashVector(text)),
      }
    },
  }
}

export function resolveDocmanDefaultEmbeddingProvider(): DocmanEmbeddingProvider {
  return createDocmanLocalHashEmbeddingProvider()
}
