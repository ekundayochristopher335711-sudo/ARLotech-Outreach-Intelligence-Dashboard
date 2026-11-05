const runningAnalysisUsers = new Set<string>()

export function claimAnalysisQueue(userId: string) {
  if (runningAnalysisUsers.has(userId)) return false
  runningAnalysisUsers.add(userId)
  return true
}

export function releaseAnalysisQueue(userId: string) {
  runningAnalysisUsers.delete(userId)
}

export function isAnalysisQueueRunning(userId: string) {
  return runningAnalysisUsers.has(userId)
}
