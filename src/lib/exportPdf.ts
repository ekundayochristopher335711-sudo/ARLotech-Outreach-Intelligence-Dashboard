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
import { loadArlotechLogoDataUrl } from '@/lib/brandAssets'

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
  format: 'PNG'
}

async function loadPdfBrandLogo(): Promise<PdfBrandLogo> {
  return { data: await loadArlotechLogoDataUrl(), format: 'PNG' }
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
      doc.addImage(logo.data, logo.format, LEFT, 7, 21, 21)
    }
    doc.setTextColor(...WHITE)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('ARLOTECH DIGITAL SOLUTIONS', LEFT + (logo ? 25 : 8), 15)
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

  const measureParagraph = (
    text: unknown,
    options: { size?: number; bold?: boolean; indent?: number } = {},
  ) => {
    const value = String(text ?? '').trim()
    if (!value) return 0
    const { size = 9, bold = false, indent = 0 } = options
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    return doc.splitTextToSize(value, CONTENT_WIDTH - indent).length * (size * 0.45 + 1) + 2
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

  const addWebsiteHealthCard = (score: number | null, summary: string, context: string) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    const summaryLines = doc.splitTextToSize(summary, CONTENT_WIDTH - 57)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    const contextLines = doc.splitTextToSize(context, CONTENT_WIDTH - 57)
    const cardHeight = Math.max(34, 16 + summaryLines.length * 4.5 + contextLines.length * 4)
    if (!ensureSpace(cardHeight + 4)) return

    doc.setFillColor(239, 246, 248)
    doc.roundedRect(LEFT, y, CONTENT_WIDTH, cardHeight, 3, 3, 'F')
    doc.setFillColor(...TEAL)
    doc.roundedRect(LEFT, y, 3, cardHeight, 1, 1, 'F')
    doc.setTextColor(...MUTED)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.text('WEBSITE HEALTH SCORE', LEFT + 8, y + 8)
    doc.setTextColor(...NAVY)
    doc.setFontSize(score === null ? 11 : 18)
    doc.text(score === null ? 'Not available' : `${score} / 100`, LEFT + 8, y + 22)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...NAVY)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(summaryLines, LEFT + 53, y + 9)
    const contextY = y + 9 + summaryLines.length * 4.5 + 2
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...SLATE)
    doc.text(contextLines, LEFT + 53, contextY)
    y += cardHeight + 5
  }

  const addWebsiteIssueCard = (index: number, title: string, impact: string) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    const titleLines = doc.splitTextToSize(title, CONTENT_WIDTH - 22)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const impactLines = doc.splitTextToSize(impact, CONTENT_WIDTH - 22)
    const cardHeight = 12 + titleLines.length * 5 + 4 + impactLines.length * 4.5 + 7
    if (!ensureSpace(cardHeight + 4)) return

    const top = y
    doc.setFillColor(250, 252, 253)
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.35)
    doc.roundedRect(LEFT, top, CONTENT_WIDTH, cardHeight, 2.5, 2.5, 'FD')
    doc.setFillColor(...TEAL)
    doc.circle(LEFT + 7, top + 8, 3.5, 'F')
    doc.setTextColor(...WHITE)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text(String(index), LEFT + 7, top + 9.2, { align: 'center' })
    doc.setTextColor(...NAVY)
    doc.setFontSize(10.5)
    doc.text(titleLines, LEFT + 14, top + 8)
    const impactLabelY = top + 8 + titleLines.length * 5 + 4
    doc.setTextColor(...TEAL)
    doc.setFontSize(7)
    doc.text('WHY THIS MAY MATTER TO CUSTOMERS', LEFT + 8, impactLabelY)
    doc.setTextColor(...SLATE)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(impactLines, LEFT + 8, impactLabelY + 5)
    y += cardHeight + 5
  }

  const addWebsiteContactCard = (impact: string, invitation: string, contactDetails: string[]) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    const impactLines = doc.splitTextToSize(impact, CONTENT_WIDTH - 14)
    const invitationLines = doc.splitTextToSize(invitation, CONTENT_WIDTH - 14)
    const contactLineGroups = contactDetails.map((detail) => doc.splitTextToSize(detail, CONTENT_WIDTH - 14))
    const cardHeight = 31 + [
      impactLines,
      invitationLines,
      ...contactLineGroups,
    ].reduce((total, lines) => total + lines.length * 4.2 + 3, 0)
    if (!ensureSpace(cardHeight + 4)) return

    const top = y
    doc.setFillColor(15, 31, 54)
    doc.roundedRect(LEFT, top, CONTENT_WIDTH, cardHeight, 3, 3, 'F')
    doc.setTextColor(148, 220, 211)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Need help with these improvements?', LEFT + 7, top + 9)
    doc.setTextColor(...WHITE)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    let textY = top + 17
    for (const lines of [impactLines, invitationLines, ...contactLineGroups]) {
      doc.text(lines, LEFT + 7, textY)
      textY += lines.length * 4.2 + 3
    }
    y += cardHeight + 5
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
    addWebsiteHealthCard,
    addWebsiteIssueCard,
    addWebsiteContactCard,
    addParagraph,
    addSection,
    ensureSpace,
    measureParagraph,
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

function relevantArlotechSupport(finding: PdfFinding) {
  const category = (finding.category || '').toLowerCase()
  if (category.includes('performance')) return 'page speed and website performance improvements'
  if (category.includes('seo')) return 'search-result presentation and technical SEO improvements'
  if (category.includes('accessibility')) return 'readability and inclusive usability improvements'
  if (category.includes('best-practices')) return 'website quality and reliability improvements'
  if (/phone|mobile|screen|display/i.test(finding.title || '')) {
    return 'responsive layout and mobile usability improvements'
  }
  return 'focused website improvements related to the verified findings'
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
  _preparedFor?: { businessName: string; verified: boolean } | null,
  logo?: PdfBrandLogo,
) {
  const rec = analysis?.record || analysis || {}
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
        support: relevantArlotechSupport(finding),
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
        return [{
          title: viewportKey === 'mobile'
            ? 'The page may be difficult to use on a phone'
            : 'The page may look uneven on a larger screen',
          impact: viewportKey === 'mobile'
            ? 'A display problem on phones could hide important details or make it harder for customers to contact you.'
            : 'A display problem on larger screens could make the business look less professional to customers comparing local options.',
          support: 'responsive layout and mobile usability improvements',
          rank: (severity === 'high' ? 12 : 8) + confidence,
        }]
      })
    : []
  const selectedTitles = new Set<string>()
  const selectedImpacts = new Set<string>()
  const topFindings = [...measuredCandidates, ...visualCandidates]
    .sort((left, right) => right.rank - left.rank)
    .filter((finding) => {
      const titleKey = finding.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
      const impactKey = finding.impact.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
      if (!titleKey || !impactKey || selectedTitles.has(titleKey) || selectedImpacts.has(impactKey)) return false
      selectedTitles.add(titleKey)
      selectedImpacts.add(impactKey)
      return true
    })
    .slice(0, 3)
  const report = createReport(
    'Website review',
    `Reviewed ${displayDate(rec.analyzed_at)}  |  Arlotech Digital Solutions`,
    'WEBSITE REVIEW',
    3,
    logo,
  )
  const scoreSummary = topFindings.length === 0
    ? score === null
      ? 'No customer issue was confirmed in the available review. We could not calculate a reliable overall score.'
      : 'The available checks did not confirm a customer issue that needs attention.'
    : score === null
      ? 'A reliable overall score was not available, so this report focuses on the customer issues supported by the review.'
      : score >= 90
        ? 'Your website has a strong overall starting point. A few focused changes may make the customer experience even smoother.'
        : score >= 70
          ? 'Your website has a fair starting point. Addressing the customer frictions below may help it work more smoothly.'
          : 'This review found areas that may be getting in customers’ way. Addressing the most important ones could make it easier to reach your business.'
  const experienceSummary = topFindings.length === 0
    ? 'This report is a helpful snapshot of the areas reviewed, not a guarantee of how every visitor experiences the website.'
    : `The review highlights ${topFindings.length} area${topFindings.length === 1 ? '' : 's'} where visitors may experience friction. Each note explains what a customer may notice and why it matters.`
  const reviewAreaLabels: Record<string, string> = {
    performance: 'how quickly pages load and respond',
    seo: 'how pages may appear in search',
    accessibility: 'how easy pages are to read and use',
    'best-practices': 'common website quality checks',
  }
  const reviewedAreas = Object.entries(scoreInputs)
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
    .map(([category]) => reviewAreaLabels[category])
    .filter(Boolean)

  report.addSection('Your website at a glance')
  report.addWebsiteHealthCard(score, scoreSummary, experienceSummary)
  report.addParagraph(
    reviewedAreas.length
      ? `Review areas included ${reviewedAreas.join('; ')}.`
      : 'The report includes only customer issues supported by the information available.',
    { size: 8.5 },
  )
  report.addParagraph(
    'The score is a guide to the areas reviewed, not a promise of search position, sales, or inquiries.',
    { size: 7.5, color: MUTED },
  )

  const positiveObservations = Array.isArray(rec.positive_observations)
    ? rec.positive_observations.filter((observation: any) =>
        typeof observation?.title === 'string' &&
        observation.title.trim() &&
        typeof observation.evidence === 'string' &&
        observation.evidence.trim() &&
        !/\b(?:speed index|largest contentful paint|first contentful paint|total blocking time|cumulative layout shift|lighthouse|pagespeed|score|kib|milliseconds?)\b/i.test(
          `${observation.title} ${observation.evidence}`,
        ),
      ).slice(0, 5)
    : []
  report.addSection("What's working well")
  if (positiveObservations.length) {
    positiveObservations.forEach((observation: any) => {
      report.addParagraph(observation.title.trim(), { bold: true, color: NAVY })
      report.addParagraph(observation.evidence.trim(), { size: 8.5, indent: 4 })
    })
  } else {
    report.addParagraph(
      'The review did not record a separate positive observation. This does not mean the website has no strengths; it means no specific positive point was verified for this report.',
      { size: 9, color: NAVY },
    )
  }

  report.addSection(`Customer friction points (${topFindings.length})`)
  if (topFindings.length === 0) {
    report.addParagraph(
      'No confirmed customer friction points were identified in the available review. We do not recommend making changes based on issues this report could not verify.',
      { size: 9, color: NAVY },
    )
  } else {
    topFindings.forEach((finding, index) => {
      report.addWebsiteIssueCard(index + 1, finding.title, finding.impact)
    })
  }
  const relevantSupport = [...new Set(topFindings.map((finding) => finding.support).filter(Boolean))]
  report.addSection('Relevant Arlotech support')
  report.addParagraph(
    relevantSupport.length
      ? `Based on the findings above, Arlotech can discuss focused options for ${relevantSupport.join('; ')}. Any proposed work should be confirmed against your goals and priorities.`
      : 'The available review did not verify a specific change to recommend. Arlotech can first discuss your goals and only suggest website work if it is useful.',
    { size: 9, color: NAVY },
  )
  const businessImpactParagraph = topFindings.length
    ? 'A clear, dependable website helps protect your reputation and gives potential customers a simpler path from finding your business to getting in touch. The points above show where a small, focused improvement may help.'
    : 'The available review did not confirm a customer issue that needs fixing. Keeping the website clear and dependable can still help protect your reputation and make it easy for customers to get in touch.'
  const contactInvitation =
    'Reply to the email that included this report if you would like to discuss a practical next step.'
  report.addWebsiteContactCard(businessImpactParagraph, contactInvitation, [
    'Email: outreach@arlotech.com.ng',
    'Website: arlotech.com.ng',
    'Phone: +2348166419332',
  ])

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
