import { describe, expect, it } from 'vitest'
import {
  clearPersistedAnalysisProgress,
  loadPersistedAnalysisProgress,
  savePersistedAnalysisProgress,
  type PersistedAnalysisProgress,
} from './persistedAnalysisProgress'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

describe('persisted website analysis progress', () => {
  it('saves and restores progress within the owning account', () => {
    const storage = memoryStorage()
    const progress: PersistedAnalysisProgress = {
      version: 1,
      active: true,
      paused: true,
      prospect_ids: ['prospect-1', 'prospect-2'],
      outcomes: [{
        prospect_id: 'prospect-1',
        analysis_completed: true,
        analysis_score: 82,
      }],
    }

    savePersistedAnalysisProgress('user-1', progress, storage)

    expect(loadPersistedAnalysisProgress('user-1', storage)).toEqual(progress)
    expect(loadPersistedAnalysisProgress('user-2', storage)).toBeNull()
  })

  it('rejects malformed saved progress instead of silently discarding it', () => {
    const storage = memoryStorage()
    storage.setItem('arlotech:website-reanalysis:v1:user-1', '{')

    expect(() => loadPersistedAnalysisProgress('user-1', storage)).toThrow(
      'Saved website analysis progress is invalid.',
    )
  })

  it('clears only the dismissed account queue so it stays closed after reload', () => {
    const storage = memoryStorage()
    const progress: PersistedAnalysisProgress = {
      version: 1,
      active: false,
      prospect_ids: ['prospect-1'],
      outcomes: [{
        prospect_id: 'prospect-1',
        analysis_completed: true,
        analysis_score: 82,
      }],
    }

    savePersistedAnalysisProgress('user-1', progress, storage)
    savePersistedAnalysisProgress('user-2', progress, storage)
    clearPersistedAnalysisProgress('user-1', storage)

    expect(loadPersistedAnalysisProgress('user-1', storage)).toBeNull()
    expect(loadPersistedAnalysisProgress('user-2', storage)).toEqual(progress)
  })
})
