export type SysOperationKind = 'list' | 'get' | 'create' | 'update' | 'delete' | 'custom'
export type SysOperationEffect = 'none' | 'db' | 'mixed'
export type SysOperationSchemaRef = { $ref: string }
export type SysOperationSchema = SysOperationSchemaRef | Record<string, unknown>

export type SysOperationArgument = {
  name: string
  optional: boolean
}

export type SysOperationPolicy = Record<string, unknown>

export type SysOperationSpec = {
  operationId: string
  toolId: string
  serviceKey: string
  serviceEntity: string
  methodName: string
  kind: SysOperationKind
  args: readonly SysOperationArgument[]
  summary?: string
  tags?: string[]
  sideEffect?: SysOperationEffect
  inputSchema?: SysOperationSchema
  outputSchema?: SysOperationSchema
  policy?: SysOperationPolicy
  examples?: string[]
}

export type DefineSysKitOperationInput = Omit<SysOperationSpec, 'toolId'> & {
  toolId?: string
}
