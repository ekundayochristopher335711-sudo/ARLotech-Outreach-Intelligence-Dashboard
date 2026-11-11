const FALLBACK_MESSAGE = 'Could not send outreach batch. Check the send-outreach function logs for details.'

function messageFromPayload(payload: unknown): string | null {
  if (typeof payload === 'string' && payload.trim()) return payload.trim().slice(0, 1000)
  if (!payload || typeof payload !== 'object') return null

  const record = payload as Record<string, unknown>
  for (const key of ['error', 'message', 'details']) {
    if (typeof record[key] === 'string' && record[key].trim()) {
      return record[key].trim().slice(0, 1000)
    }
  }
  return null
}

export async function getOutreachFunctionError(error: unknown): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = error.context
    if (context && typeof context === 'object') {
      const response = context as {
        clone?: () => { json?: () => Promise<unknown>; text?: () => Promise<string> }
        json?: () => Promise<unknown>
        text?: () => Promise<string>
      }

      const jsonResponse = typeof response.clone === 'function' ? response.clone() : response
      if (typeof jsonResponse.json === 'function') {
        try {
          const message = messageFromPayload(await jsonResponse.json())
          if (message) return message
        } catch {
          // A non-JSON response may still contain a useful text error.
        }
      }

      const textResponse = typeof response.clone === 'function' ? response.clone() : response
      if (typeof textResponse.text === 'function') {
        try {
          const text = await textResponse.text()
          const message = messageFromPayload(text)
          if (message) return message
          try {
            const parsedMessage = messageFromPayload(JSON.parse(text))
            if (parsedMessage) return parsedMessage
          } catch {
            // Return the SDK message below when the body is not useful text.
          }
        } catch {
          // Fall through to the SDK error message.
        }
      }
    }
  }

  if (error instanceof Error && error.message.trim()) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.trim()) {
    return error.message
  }
  return FALLBACK_MESSAGE
}
