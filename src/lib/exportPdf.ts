import jsPDF from 'jspdf'

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
  title?: string | null
  priority?: string | null
  evidence?: string | null
  explanation?: string | null
  recommended_fix?: string | null
}

function displayDate(value?: string | null) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString()
}

function createReport(title: string, subtitle: string) {
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
    doc.text('OUTREACH INTELLIGENCE', LEFT + 8, 21)
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
      doc.text('Prepared with ArloTech Outreach Intelligence', LEFT, PAGE_HEIGHT - 8)
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

function buildWebsiteAnalysisPdf(analysis: Record<string, any>) {
  const rec = analysis?.record || analysis || {}
  const url = rec.website_url ?? rec.url ?? 'Website not recorded'
  const report = createReport('Website intelligence', `${url} | Analyzed ${displayDate(rec.analyzed_at)}`)
  const score = rec.overall_score
  const findings: PdfFinding[] = Array.isArray(rec.findings) ? rec.findings : []
  const positives: Array<string | { title?: string | null }> = Array.isArray(rec.positive_observations)
    ? rec.positive_observations
    : []

  report.addSection('Assessment overview')
  report.addMetricCards([
    ['Overall score', score === null || score === undefined ? 'N/A' : `${score} / 100`],
    ['Findings identified', findings.length],
  ])
  report.addParagraph(
    'Prepared with ArloTech Website Intelligence using Lighthouse performance and quality metrics, website content inspection, and automated recommendations.',
    { size: 9 },
  )

  const analysisSummary = rec.ai_analysis?.summary
  const scoreExplanation = rec.ai_analysis?.score_explanation
  if (analysisSummary || scoreExplanation) {
    report.addSection('Executive summary')
    if (analysisSummary) report.addParagraph(analysisSummary)
    if (scoreExplanation) report.addParagraph(scoreExplanation)
  }

  if (rec.category_scores && Object.keys(rec.category_scores).length > 0) {
    report.addSection('Category scores')
    report.addMetricCards(
      Object.entries(rec.category_scores).map(([key, value]) => [
        key.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
        value === null || value === undefined ? 'N/A' : `${value} / 100`,
      ]),
    )
  }

  report.addSection(`Priority findings (${findings.length})`)
  if (findings.length === 0) {
    report.addParagraph('No findings were recorded for this assessment.')
  } else {
    findings.forEach((finding, index) => {
      report.ensureSpace(16)
      report.addParagraph(`${index + 1}. ${finding.title || 'Untitled finding'}`, { bold: true, color: NAVY })
      if (finding.priority) report.addParagraph(`Priority: ${finding.priority}`, { size: 8, color: TEAL })
      if (finding.evidence) report.addParagraph(`Evidence: ${finding.evidence}`, { size: 8 })
      if (finding.explanation) report.addParagraph(finding.explanation, { size: 9 })
      if (finding.recommended_fix) {
        report.addParagraph(`Recommended action: ${finding.recommended_fix}`, { size: 9, bold: true })
      }
      report.y += 3
    })
  }

  if (positives.length > 0) {
    report.addSection(`Strengths observed (${positives.length})`)
    positives.forEach((item) => {
      report.addParagraph(`- ${typeof item === 'string' ? item : item.title || 'Positive observation'}`)
    })
  }

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
