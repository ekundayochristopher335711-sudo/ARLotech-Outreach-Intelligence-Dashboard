export interface PersistedAnalysisOutcome {
  prospect_id: string
  analysis_completed: boolean
  analysis_score: number | null
  error?: string
}

export interface PersistedAnalysisProgress {
  version: 1
  active: boolean
  paused?: boolean
  prospect_ids: string[]
  outcomes: PersistedAnalysisOutcome[]
}

interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function storageKey(userId: string) {
  return `arlotech:website-reanalysis:v1:${userId}`
}

function isProgress(value: unknown): value is PersistedAnalysisProgress {
  if (!value || typeof value !== 'object') return false
  const progress = value as Partial<PersistedAnalysisProgress>
  return progress.version === 1 &&
    typeof progress.active === 'boolean' &&
  (progress.paused === undefined || typeof progress.paused === 'boolean') &&
    Array.isArray(progress.prospect_ids) &&
    progress.prospect_ids.every((id) => typeof id === 'string') &&
    Array.isArray(progress.outcomes) &&
    progress.outcomes.every((outcome) =>
      !!outcome &&
      typeof outcome.prospect_id === 'string' &&
      typeof outcome.analysis_completed === 'boolean' &&
      (typeof outcome.analysis_score === 'number' || outcome.analysis_score === null) &&
      (outcome.error === undefined || typeof outcome.error === 'string'),
    )
}

export function loadPersistedAnalysisProgress(
  userId: string,
  storage: KeyValueStorage = window.localStorage,
): PersistedAnalysisProgress | null {
  const value = storage.getItem(storageKey(userId))
  if (value === null) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('Saved website analysis progress is invalid. Clear the saved progress and start a new analysis.')
  }
  if (!isProgress(parsed)) {
    throw new Error('Saved website analysis progress has an unsupported format. Start a new analysis to replace it.')
  }
  return parsed
}

export function savePersistedAnalysisProgress(
  userId: string,
  progress: PersistedAnalysisProgress,
  storage: KeyValueStorage = window.localStorage,
) {
  storage.setItem(storageKey(userId), JSON.stringify(progress))
}
