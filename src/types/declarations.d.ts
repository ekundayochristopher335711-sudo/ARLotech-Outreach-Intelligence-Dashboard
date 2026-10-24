declare module 'supabase' {
  export interface Config {
    url: string
    auth: {
      persistSession: boolean
      autoRefreshToken: boolean
    }
  }
}

declare module '@supabase/supabase-js' {
  export interface SupabaseClient {
    auth: {
      getSession(): Promise<{ data: { session: any | null }; error: any }>
      onAuthStateChange(callback: (event: string, session: any | null) => void): { data: { unsubscribe: () => void } }
      signInWithPassword(credentials: { email: string; password: string }): Promise<{ data: any; error: any }>
      signOut(): Promise<{ error: any }>
    }
    from(table: string): any
  }
  export function createClient(url: string, key: string): SupabaseClient
  export type Session = any
}

declare module '@supabase/auth-js' {
  export type Session = any
  export type User = any
  export class AuthClient {
    getSession(): Promise<{ data: { session: any | null }; error: any }>
    onAuthStateChange(callback: (event: string, session: any | null) => void): { data: { unsubscribe: () => void } }
    signInWithPassword(credentials: { email: string; password: string }): Promise<{ data: any; error: any }>
    signOut(): Promise<{ error: any }>
  }
}

declare module 'date-fns' {
  export function format(date: Date | number | string, formatString: string): string
}

declare module 'lucide/react' {
  export * from 'lucide-react'
}

declare module 'tailwind-merge' {
  export function twMerge(...classLists: any[]): string
}

declare module 'vite' {
  export function defineConfig(options: { [key: string]: any }): {
    mode: string
    plugins: any[]
    [key: string]: any
  }
  export default function Vite(options?: any): any
}

declare module '@vitejs/plugin-react' {
  export default function React(options?: any): any
}