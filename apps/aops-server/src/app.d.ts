import type { AopsAuthProvider } from '$lib/server/auth-provider'

declare global {
  namespace App {
    interface Locals {
      tenantId: string
      locale: string
      fallbackLocale: string
      authProvider?: AopsAuthProvider
      projectId?: string
      scopeId?: string
      scopeResolution?: 'explicit' | 'cascade'
      principal?: {
        userId: string
        email?: string
        fullName?: string
        roles: string[]
        permissions?: string[]
        capabilities?: string[]
        effectiveClaims?: {
          userId: string
          claimKeys: string[]
          claimsByKey: Record<string, Record<string, unknown>>
          flattenedClaims: Record<string, unknown>
          flattenedConflicts?: Array<{ key: string; claimKeys: string[] }>
          evaluatedAt?: string | Date
        }
      }
    }
  }
}

declare module '*.md?raw' {
  const content: string
  export default content
}

export {};
