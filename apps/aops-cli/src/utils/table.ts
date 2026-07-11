import { normalizeNonEmpty } from './command.js'

type TableColumn = {
  header: string
  maxWidth?: number
}

function truncateCell(value: string, maxWidth?: number): string {
  if (!maxWidth || value.length <= maxWidth) return value
  if (maxWidth <= 3) return value.slice(0, maxWidth)
  return `${value.slice(0, maxWidth - 3)}...`
}

function padRight(value: string, width: number): string {
  return value.padEnd(width, ' ')
}

export function renderTable(params: {
  columns: TableColumn[]
  rows: Array<Array<string | number | boolean | null | undefined>>
  emptyText?: string
}): string {
  if (params.rows.length === 0) {
    return params.emptyText ?? '(no rows)'
  }

  const widths = params.columns.map((column, index) => {
    const cellWidths = params.rows.map((row) => {
      const raw = row[index]
      const normalized =
        typeof raw === 'boolean'
          ? (raw ? 'true' : 'false')
          : normalizeNonEmpty(raw) ?? String(raw ?? '-')
      return truncateCell(normalized, column.maxWidth).length
    })
    return Math.max(column.header.length, ...cellWidths)
  })

  const header = params.columns
    .map((column, index) => padRight(column.header, widths[index] ?? column.header.length))
    .join(' | ')
  const separator = widths.map((width) => ''.padEnd(width, '-')).join('-+-')
  const body = params.rows.map((row) => row
    .map((cell, index) => {
      const normalized =
        typeof cell === 'boolean'
          ? (cell ? 'true' : 'false')
          : normalizeNonEmpty(cell) ?? String(cell ?? '-')
      return padRight(truncateCell(normalized, params.columns[index]?.maxWidth), widths[index] ?? normalized.length)
    })
    .join(' | '))

  return [header, separator, ...body].join('\n')
}
