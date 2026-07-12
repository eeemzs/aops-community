declare module 'pg' {
  export interface QueryResult<T = unknown> {
    rows: T[]
  }

  export class Client {
    constructor(config?: Record<string, unknown>)
    connect(): Promise<void>
    query<T = unknown>(text: string, params?: unknown[]): Promise<QueryResult<T>>
    end(): Promise<void>
  }
}
