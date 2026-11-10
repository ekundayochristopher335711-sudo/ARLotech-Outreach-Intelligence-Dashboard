type OpenAIImage = {
  mime_type: string
  data: string
}

type OpenAIJsonResponse = {
  text: string
  parsed: Record<string, unknown>
  model: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function generateOpenAIJson(
  prompt: string,
  images: OpenAIImage[] = [],
): Promise<OpenAIJsonResponse> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')

  const model = Deno.env.get('OPENAI_MODEL') || 'gpt-6-luna'
  const content = [
    { type: 'text', text: prompt },
    ...images.map((image) => ({
      type: 'image_url',
      image_url: { url: `data:${image.mime_type};base64,${image.data}` },
    })),
  ]
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      reasoning_effort: 'none',
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content }],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`OpenAI API error (${response.status}): ${errorBody}`)
  }

  const data = await response.json()
  const text = data?.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('OpenAI returned an empty response')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('OpenAI returned invalid JSON')
  }
  if (!isRecord(parsed)) {
    throw new Error('OpenAI returned JSON with an invalid shape')
  }

  return { text, parsed, model }
}
