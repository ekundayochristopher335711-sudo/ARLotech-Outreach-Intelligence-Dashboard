import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient()

type QueryClientCacheControls = {
  getQueryCache: () => { clear: () => void }
  getMutationCache: () => { clear: () => void }
}

export function clearQueryClientCache() {
  // TanStack Query exposes these methods at runtime, but the installed package's
  // generated type surface omits them from QueryClient.
  const cacheControls = queryClient as unknown as QueryClientCacheControls
  cacheControls.getQueryCache().clear()
  cacheControls.getMutationCache().clear()
}
