export type DocmanOperationKind = 'list' | 'get' | 'create' | 'update' | 'delete' | 'custom'
export type DocmanOperationEffect = 'none' | 'db' | 'mixed'
export type DocmanOperationSchemaRef = { $ref: string }
export type DocmanOperationSchema = DocmanOperationSchemaRef | Record<string, unknown>

export type DocmanOperationArgument = {
  name: string
  optional: boolean
}

export type DocmanOperationPolicy = Record<string, unknown>

export type DocmanOperationDocs = {
  notes?: string[]
  antiPatterns?: string[]
  preconditions?: string[]
  postconditions?: string[]
}

export type DocmanOperationSpec = {
  operationId: string
  toolId: string
  serviceKey: string
  serviceEntity: string
  methodName: string
  kind: DocmanOperationKind
  args: DocmanOperationArgument[]
  summary?: string
  tags?: string[]
  sideEffect?: DocmanOperationEffect
  inputSchema?: DocmanOperationSchema
  outputSchema?: DocmanOperationSchema
  policy?: DocmanOperationPolicy
  examples?: string[]
  docs?: DocmanOperationDocs
}

export type DefineDocmanKitOperationInput = Omit<DocmanOperationSpec, 'toolId'> & {
  toolId?: string
}
