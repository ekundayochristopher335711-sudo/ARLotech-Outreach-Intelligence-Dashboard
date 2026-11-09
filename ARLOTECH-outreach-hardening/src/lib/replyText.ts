export interface SplitReplyText {
  readableText: string
  quotedText: string | null
}

function isReplySeparator(lines: string[], index: number): boolean {
  const line = lines[index].trim()
  if (
    /^On .+wrote:\s*$/i.test(line) ||
    /^-{2,}\s*Original Message\s*-{2,}$/i.test(line) ||
    /^_{5,}$/.test(line)
  ) {
    return true
  }

  if (!/^From:\s*.+/i.test(line)) return false
  return lines.slice(index + 1, index + 5).some((header) => /^(Sent|To|Subject):\s*.+/i.test(header.trim()))
}

export function splitReplyText(body: string): SplitReplyText {
  const lines = body.replace(/\r\n?/g, '\n').split('\n')
  const readableLines: string[] = []
  const quotedLines: string[] = []
  let inQuote = false

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!inQuote && (isReplySeparator(lines, index) || /^\s*>/.test(line))) {
      inQuote = true
    }

    if (inQuote) {
      quotedLines.push(line.replace(/^\s*>\s?/, ''))
    } else {
      readableLines.push(line)
    }
  }

  const readableText = readableLines.join('\n').trim()
  const quotedText = quotedLines.join('\n').trim()
  return {
    readableText: readableText || (quotedText ? '' : body.trim()),
    quotedText: quotedText || null,
  }
}
