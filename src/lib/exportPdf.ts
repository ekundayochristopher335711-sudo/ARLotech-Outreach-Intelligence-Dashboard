import jsPDF from 'jspdf'
import {
  calculateTechnicalHealthScore,
  LIGHTHOUSE_CATEGORY_WEIGHTS,
  rateLighthouseFinding,
} from '@/lib/websiteAudit'
import {
  auditFindingBusinessImpact,
  auditFindingBusinessTitle,
} from '@/lib/auditReportLanguage'

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

interface PdfBrandLogo {
  data: string
  format: 'JPEG' | 'PNG'
}

async function loadPdfBrandLogo(): Promise<PdfBrandLogo> {
  const isBlacksite = typeof localStorage !== 'undefined' &&
    localStorage.getItem('arlotech-login-mode') === 'blacksite'
  const file = isBlacksite ? 'favicon-blacksite.png' : 'favicon-standard.jpg'
  const format = isBlacksite ? 'PNG' : 'JPEG'
  const response = await fetch(`${import.meta.env.BASE_URL}${file}`)
  if (!response.ok) throw new Error(`Could not load the Arlotech PDF logo (${response.status}).`)

  const bytes = new Uint8Array(await response.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return { data: `data:image/${format.toLowerCase()};base64,${btoa(binary)}`, format }
}

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
  classification?: string | null
  priority?: string | null
  evidence?: string | null
  explanation?: string | null
  recommended_fix?: string | null
  source?: string | null
  audit_id?: string | null
  category?: string | null
  display_value?: string | null
  lighthouse_score_pct?: number | null
  assessment_rating?: string | null
  opportunity_ms?: number | null
  opportunity_bytes?: number | null
  affected_resources?: string[] | null
}

interface NormalizedPdfFinding extends PdfFinding {
  sourceLabel: 'Measured' | 'Page inspection' | 'Tool-assisted suggestion' | 'Unverified'
  dedupeKey: string
}

function displayDate(value?: string | null) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString()
}

function createReport(
  title: string,
  subtitle: string,
  brand = 'OUTREACH INTELLIGENCE',
  maxPages = Number.POSITIVE_INFINITY,
  logo?: PdfBrandLogo,
) {
  const doc = new jsPDF()
  let y = 55

  const drawHeader = (continued = false) => {
    doc.setFillColor(...NAVY)
    doc.rect(0, 0, PAGE_WIDTH, 34, 'F')
    if (logo) {
      doc.setFillColor(...WHITE)
      doc.roundedRect(LEFT, 7, 21, 21, 2, 2, 'F')
      doc.addImage(logo.data, logo.format, LEFT + 1.5, 8.5, 18, 18)
    }
    doc.setTextColor(...WHITE)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('ARLOTECH', LEFT + (logo ? 25 : 8), 15)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(brand, LEFT + (logo ? 25 : 8), 21)
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
      if (doc.getNumberOfPages() >= maxPages) return false
      doc.addPage()
      y = drawHeader(true) + 7
    }
    return true
  }

  const addSection = (heading: string) => {
    if (!ensureSpace(14)) return
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

  const startNewPage = () => {
    if (doc.getNumberOfPages() >= maxPages) return
    doc.addPage()
    y = drawHeader(true) + 7
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
      if (!ensureSpace(size * 0.45 + 1)) return
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
      if (!ensureSpace(cardHeight + 4)) return
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
          ? 'Arlotech Digital Solutions  |  Customer website review'
          : 'Prepared by Arlotech Digital Solutions',
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
    startNewPage,
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

export async function exportDashboardPdf(
  metrics: Record<string, unknown> | null,
  prospects: PdfProspect[],
  activity: PdfActivity[],
) {
  const logo = await loadPdfBrandLogo()
  const report = createReport(
    'Outreach dashboard',
    `Performance snapshot | Generated ${displayDate(new Date().toISOString())}`,
    'OUTREACH INTELLIGENCE',
    Number.POSITIVE_INFINITY,
    logo,
  )
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

export async function exportRepliesPdf(messages: PdfMessage[], prospectNames: Map<string, string> = new Map()) {
  const logo = await loadPdfBrandLogo()
  const report = createReport(
    'Replies report',
    `Inbound message summary | Generated ${displayDate(new Date().toISOString())}`,
    'OUTREACH INTELLIGENCE',
    Number.POSITIVE_INFINITY,
    logo,
  )
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
  if (
    finding.source === 'content' ||
    finding.source === 'html_inspection' ||
    finding.id?.startsWith('content-') ||
    finding.id?.startsWith('html-')
  ) return 'Page inspection'
  if (finding.source === 'ai' || finding.id?.startsWith('ai-') || finding.evidence === 'AI-generated') {
    return 'Tool-assisted suggestion'
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

function buildConsultantWebsiteAnalysisPdf(
  analysis: Record<string, any>,
  preparedFor?: { businessName: string; verified: boolean } | null,
  logo?: PdfBrandLogo,
) {
  const rec = analysis?.record || analysis || {}
  const rawUrl = typeof rec.website_url === 'string'
    ? rec.website_url
    : typeof rec.url === 'string'
      ? rec.url
      : ''
  let hostname = 'Website not recorded'
  let targetUrl = 'Not recorded'
  try {
    const parsedUrl = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`)
    hostname = parsedUrl.hostname.replace(/^www\./i, '')
    targetUrl = `${parsedUrl.origin}${parsedUrl.pathname}`.replace(/\/$/, '') || parsedUrl.origin
    if (targetUrl.length > 110) targetUrl = `${targetUrl.slice(0, 107)}...`
  } catch {
    hostname = 'Website URL unavailable'
  }
  const verifiedBusinessName = (preparedFor?.verified ? preparedFor.businessName.trim() : null) || (
    rec.prospect?.business_name_verified === true ? rec.prospect.business_name?.trim() : null
  )
  const preparedName = (verifiedBusinessName || hostname).slice(0, 70)
  const scoreInputs = Object.fromEntries(
    Object.keys(LIGHTHOUSE_CATEGORY_WEIGHTS).map((category) => [
      category,
      typeof rec.category_scores?.[category] === 'number' ? rec.category_scores[category] : null,
    ]),
  ) as Record<keyof typeof LIGHTHOUSE_CATEGORY_WEIGHTS, number | null>
  const storedCategoryScores = rec.category_scores && typeof rec.category_scores === 'object'
    ? Object.values(rec.category_scores).filter((value: unknown) =>
        typeof value === 'number' && Number.isFinite(value),
      )
    : []
  const legacyScore = storedCategoryScores.length === 0 &&
    typeof rec.overall_score === 'number' &&
    Number.isFinite(rec.overall_score)
      ? rec.overall_score
      : null
  const score = calculateTechnicalHealthScore(scoreInputs) ?? legacyScore
  const findings: PdfFinding[] = Array.isArray(rec.findings) ? rec.findings : []
  const measuredCandidates = normalizePdfFindings(findings)
    .map((finding) => ({ ...finding, assessment_rating: rateLighthouseFinding(finding) }))
    .filter((finding) =>
      (finding.sourceLabel === 'Measured' || finding.sourceLabel === 'Page inspection') &&
      finding.assessment_rating !== 'Good' &&
      finding.classification !== 'optimization_opportunity' &&
      finding.classification !== 'diagnostic' &&
      finding.classification !== 'positive_observation',
    )
    .map((finding) => {
      const priority = finding.priority?.toLowerCase()
      const priorityRank = priority === 'critical' ? 4 : priority === 'high' ? 3 : priority === 'medium' ? 2 : priority === 'low' ? 1 : 0
      const ratingRank = finding.assessment_rating === 'Poor' ? 3 : finding.assessment_rating === 'Needs Improvement' ? 2 : 1
      return {
        title: auditFindingBusinessTitle(finding),
        impact: auditFindingBusinessImpact(finding),
        rank: priorityRank * 4 + ratingRank,
      }
    })
  const aiAnalysis = rec.ai_analysis && typeof rec.ai_analysis === 'object' ? rec.ai_analysis : {}
  const visualAudit = aiAnalysis.visual_audit && typeof aiAnalysis.visual_audit === 'object'
    ? aiAnalysis.visual_audit
    : null
  const seenVisualViewports = new Set<string>()
  const visualCandidates = Array.isArray(visualAudit?.observations)
    ? visualAudit.observations.flatMap((observation: any) => {
        const confidence = typeof observation?.confidence === 'number' ? observation.confidence : 0
        const severity = typeof observation?.severity === 'string' ? observation.severity.toLowerCase() : ''
        if (confidence < 0.75 || !['high', 'medium'].includes(severity)) return []
        const viewportKey = observation.viewport === 'mobile' ? 'mobile' : 'desktop'
        if (seenVisualViewports.has(viewportKey)) return []
        seenVisualViewports.add(viewportKey)
        const viewport = viewportKey === 'mobile' ? 'on mobile' : 'on a larger screen'
        return [{
          title: `A possible display issue needs checking ${viewport}`,
          impact: 'If confirmed, this could make the page harder to read or use on this screen size.',
          rank: (severity === 'high' ? 12 : 8) + confidence,
        }]
      })
    : []
  const topFindings = [...measuredCandidates, ...visualCandidates]
    .sort((left, right) => right.rank - left.rank)
    .slice(0, 3)
  const report = createReport(
    'Website review',
    `${targetUrl}  |  Reviewed ${displayDate(rec.analyzed_at)}  |  Arlotech Digital Solutions`,
    'WEBSITE REVIEW',
    3,
    logo,
  )
  const scoreSummary = score === null
    ? 'We could not calculate a reliable overall score, so this report only highlights issues supported by the available review.'
    : score >= 90
      ? 'Your website is in good shape overall. A few focused changes may make the customer experience even smoother.'
      : score >= 70
        ? 'Your website has a fair starting point. Addressing the customer frictions below may help it work more smoothly.'
        : 'This review found areas that may be getting in customers’ way. Addressing the most important ones could make it easier to reach your business.'

  report.addSection('Your website at a glance')
  report.addParagraph(`Prepared for: ${preparedName}`, { size: 9, bold: true, color: NAVY })
  report.addParagraph(`Website reviewed: ${targetUrl}`, { size: 8 })
  report.addMetricCards([['Website health score', score === null ? 'Not available' : `${score} / 100`]])
  report.addParagraph(scoreSummary, { size: 9, bold: true, color: NAVY })
  report.addParagraph(
    `Top customer friction points (${topFindings.length})`,
    { size: 9, bold: true, color: TEAL },
  )
  if (topFindings.length === 0) {
    report.addParagraph('No confirmed customer friction points were identified in the available review.', { size: 8.5 })
  } else {
    topFindings.forEach((finding, index) => {
      report.addParagraph(`${index + 1}. ${finding.title}`, { size: 8.5, bold: true, color: NAVY })
      report.addParagraph(finding.impact, { size: 8 })
    })
  }
  report.addParagraph(
    'The score is a guide to the areas reviewed, not a promise of search position, sales, or inquiries.',
    { size: 7.5, color: MUTED },
  )

  report.startNewPage()
  report.addSection(`Priority customer issues (${topFindings.length})`)
  if (topFindings.length === 0) {
    report.addParagraph('No verified issues were found to include in this section.', { size: 9 })
  } else {
    topFindings.forEach((finding, index) => {
      report.addParagraph(`${index + 1}. ${finding.title}`, { size: 10, bold: true, color: NAVY })
      report.addParagraph(`Why it matters to your customers: ${finding.impact}`, { size: 9 })
      report.y += 5
    })
  }
  report.startNewPage()
  report.addSection('Protect your reputation and make it easier to get in touch')
  report.addParagraph(
    'When a website is slow, unclear, or difficult to use, potential customers may leave before they understand what you offer or how to contact you. A smoother, clearer experience can help your business make a stronger first impression and keep the path to an inquiry simple.',
    { size: 10, color: NAVY },
  )
  report.addParagraph(
    'The issues in this review are opportunities to reduce customer frustration—not a guarantee of more calls or bookings. The right improvements depend on your business, your customers, and the website itself.',
    { size: 9 },
  )
  report.addParagraph(
    'Reply to the email that included this report, or book a 10-minute website review call with Arlotech Digital Solutions. We will talk through what matters most to your customers and whether it is worth addressing.',
    { size: 10, bold: true, color: NAVY },
  )

  return {
    report,
    filename: `arlotech-website-report-${rec.id || 'analysis'}.pdf`,
  }
}

export async function exportWebsiteAnalysisPdf(analysis: Record<string, any>, _screenshotImages: Record<string, string> = {}) {
  const logo = await loadPdfBrandLogo()
  const { report, filename } = buildConsultantWebsiteAnalysisPdf(analysis, null, logo)
  report.finish(filename)
}

export async function createWebsiteAnalysisPdfBase64(
  analysis: Record<string, any>,
  preparedFor?: { businessName: string; verified: boolean } | null,
  _screenshotImages: Record<string, string> = {},
) {
  const logo = await loadPdfBrandLogo()
  return buildConsultantWebsiteAnalysisPdf(analysis, preparedFor, logo).report.toBase64()
}
