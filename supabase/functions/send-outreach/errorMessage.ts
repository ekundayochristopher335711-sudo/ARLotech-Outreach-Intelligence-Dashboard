const FALLBACK_MESSAGE = 'The outreach batch could not be processed.'

export function getOutreachErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'string' && error.trim()) return error
  if (!error || typeof error !== 'object') return FALLBACK_MESSAGE

  const record = error as Record<string, unknown>
  const details = ['message', 'error', 'details', 'hint']
    .flatMap((key) => typeof record[key] === 'string' && record[key].trim() ? [record[key].trim()] : [])
  if (details.length) return details.join(' ')

  const code = typeof record.code === 'string' ? record.code : null
  const keys = Object.keys(record).filter((key) => !/token|secret|authorization|password|stack/i.test(key))
  const context = code ? `Error code: ${code}.` : `Error fields: ${keys.join(', ') || 'none'}.`
  return `${FALLBACK_MESSAGE} ${context} Check the send-outreach function logs for details.`
}
