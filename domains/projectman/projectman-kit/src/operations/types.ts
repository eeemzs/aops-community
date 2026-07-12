export type ProjectmanOperationKind = 'list' | 'get' | 'create' | 'update' | 'delete' | 'custom'
export type ProjectmanOperationEffect = 'none' | 'db' | 'mixed'
export type ProjectmanOperationSchemaRef = { $ref: string }
export type ProjectmanOperationSchema = ProjectmanOperationSchemaRef | Record<string, unknown>

export type ProjectmanOperationArgument = {
  name: string
  optional: boolean
}

export type ProjectmanOperationPolicy = Record<string, unknown>

export type ProjectmanOperationSpec = {
  operationId: string
  toolId: string
  serviceKey: string
  serviceEntity: string
  methodName: string
  kind: ProjectmanOperationKind
  args: ProjectmanOperationArgument[]
  summary?: string
  tags?: string[]
  sideEffect?: ProjectmanOperationEffect
  inputSchema?: ProjectmanOperationSchema
  outputSchema?: ProjectmanOperationSchema
  policy?: ProjectmanOperationPolicy
  examples?: string[]
}

export type DefineProjectmanKitOperationInput = Omit<ProjectmanOperationSpec, 'toolId'> & {
  toolId?: string
}
