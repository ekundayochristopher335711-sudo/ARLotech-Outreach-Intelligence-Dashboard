import jsPDF from 'jspdf'
import { lighthouseRecommendation } from '@/lib/lighthouseRecommendations'

const PAGE_WIDTH = 210
const PAGE_HEIGHT = 297
const LEFT = 16
const RIGHT = 194
const CONTENT_WIDTH = RIGHT - LEFT
const BODY_BOTTOM = 276
const NAVY = [15, 31, 54] as const
const TEAL = [13, 118, 110] as const
const SLATE = [71, 85, 105] as const
const MUTED = [100, 116, 139] as const
const LIGHT = [241, 245, 249] as const
const WHITE = [255, 255, 255] as const

interface PdfProspect {
  business_name?: string | null
  contact_name?: string | null
  email?: string | null
  status?: string | null
}

interface PdfActivity {
  event_type?: string | null
  description?: string | null
  created_at?: string | null
}

interface PdfMessage {
  subject?: string | null
  status?: string | null
  received_at?: string | null
  created_at?: string | null
  body?: string | null
  prospect_id?: string | null
}

interface PdfFinding {
  id?: string | null
  title?: string | null
  priority?: string | null
  evidence?: string | null
  explanation?: string | null
  recommended_fix?: string | null
  source?: string | null
  audit_id?: string | null
  category?: string | null
  display_value?: string | null
  opportunity_ms?: number | null
  opportunity_bytes?: number | null
  affected_resources?: string[] | null
}

interface NormalizedPdfFinding extends PdfFinding {
  sourceLabel: 'Measured' | 'Page inspection' | 'AI-assisted suggestion' | 'Unverified'
  dedupeKey: string
}

function displayDate(value?: string | null) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString()
}

function useTeamVoice(value: string) {
  return value
    .replace(/\bI['’]m\b/g, "we're")
    .replace(/\bI['’]ve\b/g, "we've")
    .replace(/\bI['’]ll\b/g, "we'll")
    .replace(/\bI['’]d\b/g, "we'd")
    .replace(/\bmy\b/gi, 'our')
    .replace(/\bmine\b/gi, 'ours')
    .replace(/\bme\b/gi, 'us')
    .replace(/\bI\b/g, (pronoun, offset, text) =>
      offset === 0 || /[.!?]\s*$/.test(text.slice(0, offset)) ? 'We' : 'we',
    )
}

function createReport(title: string, subtitle: string, brand = 'OUTREACH INTELLIGENCE') {
  const doc = new jsPDF()
  let y = 55

  const drawHeader = (continued = false) => {
    doc.setFillColor(...NAVY)
    doc.rect(0, 0, PAGE_WIDTH, 34, 'F')
    doc.setFillColor(...TEAL)
    doc.roundedRect(LEFT, 9, 3, 16, 1, 1, 'F')
    doc.setTextColor(...WHITE)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('ARLOTECH', LEFT + 8, 15)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(brand, LEFT + 8, 21)
    doc.setTextColor(148, 190, 195)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.text(continued ? 'REPORT - CONTINUED' : 'INTELLIGENCE REPORT', RIGHT, 15, { align: 'right' })
    doc.setTextColor(...NAVY)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text(title, LEFT, 46)
    doc.setTextColor(...MUTED)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const subtitleLines = doc.splitTextToSize(subtitle, CONTENT_WIDTH)
    doc.text(subtitleLines, LEFT, 52)
    return 55 + subtitleLines.length * 4
  }

  y = drawHeader()

  const ensureSpace = (needed: number) => {
    if (y + needed > BODY_BOTTOM) {
      doc.addPage()
      y = drawHeader(true) + 7
    }
  }

  const addSection = (heading: string) => {
    ensureSpace(14)
    y += 3
    doc.setTextColor(...TEAL)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(heading.toUpperCase(), LEFT, y)
    y += 3
    doc.setDrawColor(203, 213, 225)
    doc.setLineWidth(0.35)
    doc.line(LEFT, y, RIGHT, y)
    y += 7
  }

  const addParagraph = (
    text: unknown,
    options: { size?: number; color?: readonly [number, number, number]; bold?: boolean; indent?: number } = {},
  ) => {
    const value = String(text ?? '').trim()
    if (!value) return
    const { size = 9, color = SLATE, bold = false, indent = 0 } = options
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.setTextColor(...color)
    const lines = doc.splitTextToSize(value, CONTENT_WIDTH - indent)
    for (const line of lines) {
      ensureSpace(size * 0.45 + 1)
      doc.text(line, LEFT + indent, y)
      y += size * 0.45 + 1
    }
    y += 2
  }

  const addMetricCards = (metrics: Array<[string, unknown]>) => {
    const columns = 2
    const gap = 5
    const cardWidth = (CONTENT_WIDTH - gap) / columns
    const cardHeight = 19
    for (let index = 0; index < metrics.length; index += columns) {
      ensureSpace(cardHeight + 4)
      metrics.slice(index, index + columns).forEach(([label, value], column) => {
        const x = LEFT + column * (cardWidth + gap)
        doc.setFillColor(...LIGHT)
        doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'F')
        doc.setTextColor(...MUTED)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.text(label, x + 4, y + 6)
        doc.setTextColor(...NAVY)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(13)
        doc.text(String(value ?? 0), x + 4, y + 14)
      })
      y += cardHeight + 4
    }
  }

  const finish = (filename: string) => {
    const pageCount = doc.getNumberOfPages()
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page)
      doc.setDrawColor(226, 232, 240)
      doc.setLineWidth(0.3)
      doc.line(LEFT, PAGE_HEIGHT - 13, RIGHT, PAGE_HEIGHT - 13)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...MUTED)
      doc.text(
        brand === 'WEB INTELLIGENCE'
          ? 'ArloTech Web Intelligence  |  Lighthouse + page inspection'
          : 'Prepared with ArloTech Outreach Intelligence',
        LEFT,
        PAGE_HEIGHT - 8,
      )
      doc.text(`${page} / ${pageCount}`, RIGHT, PAGE_HEIGHT - 8, { align: 'right' })
    }
    doc.save(filename)
  }

  const toBase64 = () => doc.output('datauristring').split(',')[1]

  return {
    doc,
    addMetricCards,
    addParagraph,
    addSection,
    ensureSpace,
    finish,
    toBase64,
    get y() {
      return y
    },
    set y(value: number) {
      y = value
    },
  }
}

export function exportDashboardPdf(
  metrics: Record<string, unknown> | null,
  prospects: PdfProspect[],
  activity: PdfActivity[],
) {
  const report = createReport('Outreach dashboard', `Performance snapshot | Generated ${displayDate(new Date().toISOString())}`)
  const metricLabels: Record<string, string> = {
    total_prospects: 'Total prospects',
    prospects_contacted: 'Prospects contacted',
    emails_sent: 'Emails sent',
    replies_received: 'Replies received',
    interested_prospects: 'Interested prospects',
    follow_ups_due: 'Follow-ups due',
    meetings_booked: 'Meetings booked',
    clients_won: 'Clients won',
  }
  report.addSection('Pipeline overview')
  report.addMetricCards(
    Object.entries(metricLabels).map(([key, label]) => [label, metrics?.[key] ?? 0]),
  )

  report.addSection('Recent prospects')
  if (prospects.length === 0) {
    report.addParagraph('No prospects to report.')
  } else {
    prospects.forEach((prospect, index) => {
      report.ensureSpace(16)
      report.addParagraph(`${index + 1}. ${prospect.business_name || 'Unnamed prospect'}`, {
        bold: true,
        color: NAVY,
      })
      report.addParagraph(
        [prospect.contact_name, prospect.email, prospect.status || 'Status unavailable'].filter(Boolean).join('  |  '),
        { size: 8, indent: 4 },
      )
    })
  }

  report.addSection('Recent activity')
  if (activity.length === 0) {
    report.addParagraph('No recent activity to report.')
  } else {
    activity.forEach((item) => {
      report.ensureSpace(12)
      report.addParagraph(item.description || item.event_type || 'Activity', { bold: true, color: NAVY })
      report.addParagraph(
        [item.event_type, item.created_at ? displayDate(item.created_at) : null].filter(Boolean).join('  |  '),
        { size: 8, indent: 4 },
      )
    })
  }

  report.finish('arlotech-outreach-dashboard.pdf')
}

export function exportRepliesPdf(messages: PdfMessage[], prospectNames: Map<string, string> = new Map()) {
  const report = createReport('Replies report', `Inbound message summary | Generated ${displayDate(new Date().toISOString())}`)
  report.addSection('Report summary')
  report.addMetricCards([['Replies included', messages.length]])
  report.addSection('Latest replies')

  if (messages.length === 0) {
    report.addParagraph('No replies to report.')
  } else {
    messages.forEach((message, index) => {
      report.ensureSpace(18)
      report.addParagraph(`${index + 1}. ${message.subject || 'No subject'}`, { bold: true, color: NAVY })
      const metadata = [
        message.prospect_id ? prospectNames.get(message.prospect_id) || 'Prospect' : 'Unlinked message',
        message.status || 'Status unavailable',
        displayDate(message.received_at || message.created_at),
      ]
      report.addParagraph(metadata.join('  |  '), { size: 8 })
      if (message.body) {
        report.addParagraph(message.body, { size: 9, indent: 4 })
      }
      report.y += 3
    })
  }

  report.finish('arlotech-replies-report.pdf')
}

function normalizedFindingKey(finding: PdfFinding) {
  const raw = String(finding.title || finding.recommended_fix || '').toLowerCase()
  if (/unused\s+(?:javascript|js)|(?:javascript|js)\s+(?:is\s+)?unused/.test(raw)) return 'unused-javascript'
  if (/legacy\s+(?:javascript|js)|(?:javascript|js)\s+legacy/.test(raw)) return 'legacy-javascript'
  if (/forced\s+reflow|layout\s+thrash/.test(raw)) return 'forced-reflow'
  if (/render.blocking/.test(raw)) return 'render-blocking-resources'
  return raw
    .replace(/\bjavascript\b/g, 'js')
    .replace(/\bwebsite\b|\bpage\b|\bsite\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function findingSource(finding: PdfFinding): NormalizedPdfFinding['sourceLabel'] {
  if (finding.source === 'lighthouse' || finding.id?.startsWith('ps-')) return 'Measured'
  if (finding.source === 'content' || finding.id?.startsWith('content-')) return 'Page inspection'
  if (finding.source === 'ai' || finding.id?.startsWith('ai-') || finding.evidence === 'AI-generated') {
    return 'AI-assisted suggestion'
  }
  return 'Unverified'
}

function normalizePdfFindings(findings: PdfFinding[]) {
  const unique = new Map<string, NormalizedPdfFinding>()
  for (const finding of findings) {
    const dedupeKey = normalizedFindingKey(finding)
    if (!dedupeKey) continue
    const normalized = { ...finding, dedupeKey, sourceLabel: findingSource(finding) }
    const existing = unique.get(dedupeKey)
    const sourceRank = (source: NormalizedPdfFinding['sourceLabel']) =>
      source === 'Measured' ? 3 : source === 'Page inspection' ? 2 : source === 'Unverified' ? 1 : 0
    if (!existing || sourceRank(normalized.sourceLabel) > sourceRank(existing.sourceLabel)) {
      unique.set(dedupeKey, normalized)
    }
  }
  return [...unique.values()]
}

function formatOpportunity(finding: PdfFinding) {
  const values: string[] = []
  if (typeof finding.opportunity_ms === 'number' && finding.opportunity_ms > 0) {
    values.push(`${(finding.opportunity_ms / 1000).toFixed(1)} s`)
  }
  if (typeof finding.opportunity_bytes === 'number' && finding.opportunity_bytes > 0) {
    values.push(`${(finding.opportunity_bytes / 1024).toFixed(0)} KB`)
  }
  return values.length ? `Estimated opportunity: ${values.join(' · ')}` : null
}

function buildWebsiteAnalysisPdf(analysis: Record<string, any>) {
  const rec = analysis?.record || analysis || {}
  const url = rec.website_url ?? rec.url ?? 'Website not recorded'
  let hostname = url
  try {
    hostname = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./i, '')
  } catch {
    hostname = String(url)
  }
  const report = createReport('Website audit', `${hostname}  |  Assessed ${displayDate(rec.analyzed_at)}`, 'WEB INTELLIGENCE')
  const categoryScores = rec.category_scores && typeof rec.category_scores === 'object'
    ? Object.entries(rec.category_scores).filter((entry): entry is [string, number] =>
        typeof entry[1] === 'number' && Number.isFinite(entry[1]),
      )
    : []
  const scoreIsCalculated = categoryScores.length > 0
  const score = scoreIsCalculated
    ? Math.round(categoryScores.reduce((total, [, value]) => total + value, 0) / categoryScores.length)
    : typeof rec.overall_score === 'number' && Number.isFinite(rec.overall_score)
      ? rec.overall_score
      : null
  const allFindings: PdfFinding[] = Array.isArray(rec.findings) ? rec.findings : []
  const uniqueFindings = normalizePdfFindings(allFindings)
  const measuredFindings = uniqueFindings.filter(
    (finding) => finding.sourceLabel === 'Measured' || finding.sourceLabel === 'Page inspection',
  )
  const unverifiedFindings = uniqueFindings.filter(
    (finding) => finding.sourceLabel === 'AI-assisted suggestion' || finding.sourceLabel === 'Unverified',
  )
  const findings = measuredFindings
    .sort((left, right) => {
      const rank = (priority?: string | null) =>
        priority?.toLowerCase() === 'high' ? 0 : priority?.toLowerCase() === 'medium' ? 1 : 2
      return rank(left.priority) - rank(right.priority)
    })
  const primaryFindings = findings.slice(0, 8)
  const findingCountLabel = primaryFindings.length === findings.length
    ? `Verified observations (${primaryFindings.length})`
    : `Verified observations (${primaryFindings.length} shown)`
  const positives: Array<string | { title?: string | null; evidence?: string | null }> = Array.isArray(rec.positive_observations)
    ? rec.positive_observations
    : []

  report.addSection('Assessment at a glance')
  report.addMetricCards([
    ['PageSpeed score', score === null ? 'Not available' : `${score} / 100`],
    ['Verified observations shown', primaryFindings.length],
  ])
  report.addParagraph(
    score === null
      ? 'A PageSpeed score was unavailable for this assessment. The findings below are reported separately and do not imply a numeric overall score.'
      : scoreIsCalculated
        ? `The PageSpeed score is the rounded arithmetic mean of the available Lighthouse category scores (${categoryScores.map(([key, value]) => `${key.replace(/-/g, ' ')} ${value}`).join(', ')}). It summarizes those measurements; it is not a count of issues or an independent quality certification.`
        : `A score of ${score} / 100 was stored for this earlier assessment, but its category scores are unavailable, so its calculation cannot be reconstructed from the saved data.`,
    { size: 8.5 },
  )

  report.addSection('Assessment scope')
  report.addParagraph(
    'We assessed the website page and technical signals observed at the time shown above. This report focuses on site observations and does not identify a website owner or prospective recipient.',
    { size: 8.5 },
  )

  if (categoryScores.length > 0) {
    report.addSection('PageSpeed category scores')
    report.addMetricCards(
      categoryScores.map(([key, value]) => [
        key.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
        `${value} / 100`,
      ]),
    )
  }

  report.addSection(findingCountLabel)
  if (primaryFindings.length === 0) {
    report.addParagraph('No scored Lighthouse issues or direct page-inspection issues were recorded.')
  } else {
    primaryFindings.forEach((finding, index) => {
      report.ensureSpace(20)
      report.addParagraph(`${index + 1}. ${finding.title || 'Untitled finding'}`, { bold: true, color: NAVY, size: 9.5 })
      const metadata = [
        finding.sourceLabel,
        finding.category?.replace(/-/g, ' '),
        finding.priority ? `${finding.priority} priority` : null,
      ].filter(Boolean)
      report.addParagraph(metadata.join('  |  '), { size: 7.5, color: TEAL })
      const evidence = finding.display_value || finding.evidence
      if (evidence && evidence !== 'AI-generated') report.addParagraph(`Observed: ${evidence}`, { size: 8 })
      const opportunity = formatOpportunity(finding)
      if (opportunity) report.addParagraph(opportunity, { size: 7.5 })
      if (finding.explanation && finding.sourceLabel !== 'Measured') {
        report.addParagraph(finding.explanation, { size: 8 })
      }
      if (finding.recommended_fix || finding.sourceLabel === 'Measured') {
        const auditId = finding.audit_id || finding.id?.replace(/^ps-/, '') || ''
        const recommendation = finding.sourceLabel === 'Measured'
          ? lighthouseRecommendation(auditId, finding.title || 'this issue')
          : finding.recommended_fix
        if (recommendation) report.addParagraph(`Our recommendation: ${useTeamVoice(recommendation)}`, { size: 8, bold: true })
      }
      const resources = finding.affected_resources?.filter(Boolean).slice(0, 3) ?? []
      for (const resource of resources) {
        report.addParagraph(`Affected resource: ${resource}`, { size: 7, color: MUTED, indent: 3 })
      }
      report.y += 1
    })
  }

  if (findings.length > primaryFindings.length) {
    report.addParagraph(`${findings.length - primaryFindings.length} additional unique observations are not included in this PDF; view them in the dashboard.`, {
      size: 7.5,
      color: MUTED,
    })
  }

  if (unverifiedFindings.length > 0) {
    report.addSection(`AI-assisted suggestions (${unverifiedFindings.length}; not measured findings)`)
    unverifiedFindings.slice(0, 3).forEach((finding) => {
      const suggestion = useTeamVoice(finding.title || finding.recommended_fix || 'Review this suggestion manually.')
      const recommendation = /^we recommend\b/i.test(suggestion) ? suggestion : `We recommend: ${suggestion}`
      report.addParagraph(recommendation, { size: 8 })
    })
    if (unverifiedFindings.length > 3) {
      report.addParagraph(`${unverifiedFindings.length - 3} further suggestions omitted for brevity.`, { size: 7.5, color: MUTED })
    }
  }

  if (positives.length > 0) {
    const measuredPositives = positives.filter((item) =>
      typeof item === 'object' && item.evidence !== 'AI-generated',
    )
    if (measuredPositives.length > 0) {
      report.addSection('Observed strengths')
      measuredPositives.slice(0, 4).forEach((item) => {
        report.addParagraph(`- ${typeof item === 'string' ? item : item.title || 'Positive observation'}`, { size: 8 })
      })
    }
  }

  report.addParagraph(
    'Method: We used Lighthouse/PageSpeed measurements and direct HTML page inspection at the time shown above. Results can vary by device, network, location, and page state. We recommend confirming the affected resources before implementation.',
    { size: 7, color: MUTED },
  )

  return {
    report,
    filename: `arlotech-website-report-${rec.id || 'analysis'}.pdf`,
  }
}

export function exportWebsiteAnalysisPdf(analysis: Record<string, any>) {
  const { report, filename } = buildWebsiteAnalysisPdf(analysis)
  report.finish(filename)
}

export function createWebsiteAnalysisPdfBase64(analysis: Record<string, any>) {
  return buildWebsiteAnalysisPdf(analysis).report.toBase64()
}
