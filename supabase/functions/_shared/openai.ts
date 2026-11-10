type OpenAIImage = {
  mime_type: string
  data: string
}

export type OpenAIImageDetail = 'low' | 'high'

export interface OpenAIRequestOptions {
  model?: string
  max_tokens?: number
  temperature?: number
  image_detail?: OpenAIImageDetail
  timeout_ms?: number
  max_retries?: number
  system_prompt?: string
  text_mode?: boolean
}

export interface OpenAIUsage {
  prompt_tokens: number | null
  completion_tokens: number | null
  total_tokens: number | null
}

export interface OpenAIJsonResponse {
  text: string
  parsed: Record<string, unknown> | null
  model: string
  usage: OpenAIUsage
  duration_ms: number
  is_json: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function imageDetailFlag(detail: OpenAIImageDetail): 'low' | 'high' | 'auto' {
  return detail === 'high' ? 'high' : 'low'
}

const DEFAULT_MODEL = 'gpt-6-luna'
const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_MAX_RETRIES = 2

function resolveOptions(options: OpenAIRequestOptions = {}): Required<OpenAIRequestOptions> {
  return {
    model: options.model ?? Deno.env.get('OPENAI_MODEL') ?? DEFAULT_MODEL,
    max_tokens: options.max_tokens ?? null,
    temperature: options.temperature ?? null,
    image_detail: options.image_detail ?? 'low',
    timeout_ms: options.timeout_ms ?? DEFAULT_TIMEOUT_MS,
    max_retries: options.max_retries ?? DEFAULT_MAX_RETRIES,
    system_prompt: options.system_prompt ?? null,
    text_mode: options.text_mode ?? false,
  }
}

export async function generateOpenAIJson(
  prompt: string,
  images: OpenAIImage[] = [],
  options: OpenAIRequestOptions = {},
): Promise<OpenAIJsonResponse> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')

  const config = resolveOptions(options)
  const startTime = Date.now()

  const content = [
    { type: 'text', text: prompt },
    ...images.map((image) => ({
      type: 'image_url',
      image_url: {
        url: `data:${image.mime_type};base64,${image.data}`,
        detail: imageDetailFlag(config.image_detail),
      },
    })),
  ]

  const messages: Array<{ role: string; content: unknown }> = []
  if (config.system_prompt) {
    messages.push({ role: 'system', content: config.system_prompt })
  }
  messages.push({ role: 'user', content })

  const body: Record<string, unknown> = {
    model: config.model,
    reasoning_effort: 'none',
    messages,
  }
  if (!config.text_mode) {
    body.response_format = { type: 'json_object' }
  }
  if (config.max_tokens !== null) body.max_tokens = config.max_tokens
  if (config.temperature !== null) body.temperature = config.temperature

  let lastError: unknown = null
  let response: Response | null = null

  for (let attempt = 0; attempt <= config.max_retries; attempt += 1) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), config.timeout_ms)

      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (response.ok) break

      const errorBody = await response.text()
      lastError = new Error(`OpenAI API error (${response.status}): ${errorBody}`)

      // Retry only on rate-limiting or transient server errors.
      const retryable = response.status === 429 || response.status >= 500
      if (!retryable || attempt === config.max_retries) {
        throw lastError
      }
      await sleep(Math.min(1000 * (attempt + 1), 8000))
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        lastError = new Error(`OpenAI request timed out after ${config.timeout_ms} ms`)
        if (attempt === config.max_retries) throw lastError
        await sleep(Math.min(1000 * (attempt + 1), 8000))
        continue
      }
      lastError = error
      if (attempt === config.max_retries) throw lastError
      await sleep(Math.min(1000 * (attempt + 1), 8000))
    }
  }

  if (!response) {
    throw lastError ?? new Error('OpenAI request failed without a response')
  }

  const data = await response.json()
  const text = data?.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('OpenAI returned an empty response')
  }

  let parsed: Record<string, unknown> | null = null
  let is_json = false
  if (!config.text_mode) {
    try {
      parsed = JSON.parse(text)
      if (isRecord(parsed)) {
        is_json = true
      } else {
        parsed = null
      }
    } catch {
      parsed = null
    }
    if (!is_json) {
      throw new Error('OpenAI returned invalid JSON in non-text mode')
    }
  }

  const usage = data?.usage
  return {
    text,
    parsed,
    model: config.model,
    usage: {
      prompt_tokens: typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : null,
      completion_tokens:
        typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : null,
      total_tokens: typeof usage?.total_tokens === 'number' ? usage.total_tokens : null,
    },
    duration_ms: Date.now() - startTime,
    is_json,
  }
}
