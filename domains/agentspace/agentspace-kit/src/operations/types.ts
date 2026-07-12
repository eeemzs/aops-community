export type AgentspaceOperationKind = 'list' | 'get' | 'create' | 'update' | 'delete' | 'custom'
export type AgentspaceOperationEffect = 'none' | 'db' | 'mixed'
export type AgentspaceOperationSchemaRef = { $ref: string }
export type AgentspaceOperationSchema = AgentspaceOperationSchemaRef | Record<string, unknown>

export type AgentspaceOperationArgument = {
  name: string
  optional: boolean
}

export type AgentspaceOperationPolicy = Record<string, unknown>

export type AgentspaceOperationSpec = {
  operationId: string
  toolId: string
  serviceKey: string
  serviceEntity: string
  methodName: string
  kind: AgentspaceOperationKind
  args: AgentspaceOperationArgument[]
  summary?: string
  tags?: string[]
  sideEffect?: AgentspaceOperationEffect
  inputSchema?: AgentspaceOperationSchema
  outputSchema?: AgentspaceOperationSchema
  policy?: AgentspaceOperationPolicy
  examples?: string[]
}

export type DefineAgentspaceKitOperationInput = Omit<AgentspaceOperationSpec, 'toolId'> & {
  toolId?: string
}
