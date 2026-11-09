declare module '@supabase/supabase-js' {
  export interface Session {
    access_token: string
    user: { id: string; email?: string; user_metadata?: Record<string, unknown> }
  }

  export interface SupabaseClient<DatabaseSchema = unknown> {
    auth: {
      getSession(): Promise<{ data: { session: Session | null }; error: Error | null }>
      onAuthStateChange(
        callback: (event: string, session: Session | null) => void,
      ): { data: { subscription: { unsubscribe: () => void } } }
      signInWithPassword(credentials: { email: string; password: string }): Promise<{ error: Error | null }>
      signOut(): Promise<{ error: Error | null }>
    }
    from(table: string): any
    functions: {
      invoke<T = unknown>(
        name: string,
        options: { body?: unknown },
      ): Promise<{ data: T | null; error: Error | null }>
    }
    storage: {
      from(bucket: string): {
        upload(path: string, file: Blob, options?: { contentType?: string; upsert?: boolean }): Promise<{ error: Error | null }>
        createSignedUrl(path: string, expiresIn: number): Promise<{
          data: { signedUrl: string } | null
          error: Error | null
        }>
      }
    }
  }

  export function createClient<DatabaseSchema = unknown>(url: string, key: string): SupabaseClient<DatabaseSchema>
}

declare module '@tanstack/react-query' {
  export class QueryClient {
    constructor(config?: object)
    invalidateQueries(filters?: object): Promise<void>
  }
  export const QueryClientProvider: (props: {
    client: QueryClient
    children?: import('react').ReactNode
  }) => import('react').ReactElement
  export function useQuery<TData = unknown>(options: any): any
  export function useMutation<TData = unknown, TError = Error, TVariables = void>(options: any): any
  export function useQueryClient(): QueryClient
}

declare module 'date-fns' {
  export function format(date: Date | number | string, formatString: string): string
}

declare module '@vitejs/plugin-react' {
  import type { PluginOption } from 'vite'
  export default function react(options?: Record<string, unknown>): PluginOption
}

declare module 'tailwind-merge' {
  export function twMerge(...classLists: unknown[]): string
}

declare module 'vitest/config' {
  export function defineConfig(options: Record<string, unknown>): any
}
