import jsPDF from 'jspdf'
import { lighthouseRecommendation } from '@/lib/lighthouseRecommendations'
import { calculateTechnicalHealthScore, LIGHTHOUSE_CATEGORY_WEIGHTS } from '@/lib/websiteAudit'
import {
  auditFindingRecommendation,
  auditFindingTitle,
  auditFindingWhy,
  clientFriendlyAuditText,
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
          ? 'Arlotech Digital Solutions  |  Lighthouse + page inspection'
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

function formatOpportunity(finding: PdfFinding) {
  const values: string[] = []
  if (typeof finding.opportunity_ms === 'number' && finding.opportunity_ms > 0) {
    values.push(finding.opportunity_ms >= 100
      ? `${(finding.opportunity_ms / 1000).toFixed(1)} s`
      : `${Math.round(finding.opportunity_ms)} ms`)
  }
  if (typeof finding.opportunity_bytes === 'number' && finding.opportunity_bytes > 0) {
    values.push(`${(finding.opportunity_bytes / 1024).toFixed(0)} KiB`)
  }
  return values.length ? `Estimated opportunity: ${values.join(' · ')}` : null
}

function recommendationConcept(title: string) {
  if (/\bh1\b|heading/i.test(title)) return 'h1'
  if (/canonical/i.test(title)) return 'canonical'
  if (/content|word count|copy|text/i.test(title)) return 'content'
  if (/alt text|alt attribute|image alternative/i.test(title)) return 'alt-text'
  if (/meta description/i.test(title)) return 'meta-description'
  return null
}

function buildWebsiteAnalysisPdf(
  analysis: Record<string, any>,
  preparedFor?: { businessName: string; verified: boolean } | null,
) {
  const rec = analysis?.record || analysis || {}
  const url = rec.website_url ?? rec.url ?? 'Website not recorded'
  let hostname = url
  try {
    hostname = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./i, '')
  } catch {
    hostname = String(url)
  }
  const report = createReport('Website audit', `${hostname}  |  Assessed ${displayDate(rec.analyzed_at)}  |  Prepared by Arlotech Digital Solutions`, 'WEB INTELLIGENCE')
  const verifiedBusinessName = (preparedFor?.verified ? preparedFor.businessName.trim() : null) || (
    rec.prospect?.business_name_verified === true ? rec.prospect.business_name?.trim() : null
  )
  const assessedAddress = /^https?:\/\//i.test(url)
    ? url
    : hostname === 'Website not recorded'
      ? 'Not recorded'
      : `https://${url}`
  const storedCategoryScores = rec.category_scores && typeof rec.category_scores === 'object'
    ? Object.entries(rec.category_scores).filter((entry): entry is [string, number] =>
        typeof entry[1] === 'number' && Number.isFinite(entry[1]),
      )
    : []
  const scoreInputs = Object.fromEntries(
    Object.keys(LIGHTHOUSE_CATEGORY_WEIGHTS).map((category) => [
      category,
      typeof rec.category_scores?.[category] === 'number' ? rec.category_scores[category] : null,
    ]),
  ) as Record<keyof typeof LIGHTHOUSE_CATEGORY_WEIGHTS, number | null>
  const weightedScore = calculateTechnicalHealthScore(scoreInputs)
  const scoreIsCalculated = weightedScore !== null
  const hasLegacyStoredScore = storedCategoryScores.length === 0 &&
    typeof rec.overall_score === 'number' &&
    Number.isFinite(rec.overall_score)
  const score = weightedScore ?? (hasLegacyStoredScore ? rec.overall_score : null)
  const categoryScores = Object.keys(LIGHTHOUSE_CATEGORY_WEIGHTS).map((category) => {
    const value = typeof rec.category_scores?.[category] === 'number' &&
      Number.isFinite(rec.category_scores[category])
      ? rec.category_scores[category]
      : null
    return [category, value] as const
  })
  const allFindings: PdfFinding[] = Array.isArray(rec.findings) ? rec.findings : []
  const uniqueFindings = normalizePdfFindings(allFindings)
  const measuredFindings = uniqueFindings.filter(
    (finding) => finding.sourceLabel === 'Measured' || finding.sourceLabel === 'Page inspection',
  )
  const unverifiedFindings = uniqueFindings.filter(
    (finding) => finding.sourceLabel === 'Tool-assisted suggestion' || finding.sourceLabel === 'Unverified',
  )
  const findings = measuredFindings
    .sort((left, right) => {
      const timeLeft = left.opportunity_ms ?? 0
      const timeRight = right.opportunity_ms ?? 0
      if (timeLeft !== timeRight) return timeRight - timeLeft
      const bytesLeft = left.opportunity_bytes ?? 0
      const bytesRight = right.opportunity_bytes ?? 0
      if (bytesLeft !== bytesRight) return bytesRight - bytesLeft
      return 0
    })
  const primaryFindings = findings
  const measuredFindingConcepts = new Set(
    findings.map((finding) => recommendationConcept(finding.title || '')).filter(Boolean),
  )
  const additionalRecommendations = unverifiedFindings.filter((finding) => {
    const concept = recommendationConcept(finding.title || finding.recommended_fix || '')
    return !concept || !measuredFindingConcepts.has(concept)
  })
  const positives: Array<string | { title?: string | null; evidence?: string | null }> = Array.isArray(rec.positive_observations)
    ? rec.positive_observations
    : []
  const aiAnalysis = rec.ai_analysis && typeof rec.ai_analysis === 'object' ? rec.ai_analysis : {}
  const auditCompleteness = aiAnalysis.audit_completeness && typeof aiAnalysis.audit_completeness === 'object'
    ? aiAnalysis.audit_completeness
    : null
  const aiRecommendations: string[] = Array.isArray(aiAnalysis.recommendations)
    ? aiAnalysis.recommendations.filter((item: unknown): item is string => typeof item === 'string' && !!item.trim())
    : []
  const optimizationOpportunities: PdfFinding[] = Array.isArray(aiAnalysis.optimization_opportunities)
    ? aiAnalysis.optimization_opportunities.filter((item: unknown): item is PdfFinding => {
        if (!item || typeof item !== 'object') return false
        const finding = item as Record<string, unknown>
        return finding.classification === 'optimization_opportunity' &&
          typeof finding.title === 'string' &&
          typeof finding.evidence === 'string'
      })
    : []
  const visualAudit = aiAnalysis.visual_audit && typeof aiAnalysis.visual_audit === 'object'
    ? aiAnalysis.visual_audit
    : null
  const visualPages = Array.isArray(visualAudit?.pages) ? visualAudit.pages : []
  const visualObservations = Array.isArray(visualAudit?.observations) ? visualAudit.observations : []

  report.addSection('Assessment at a glance')
  report.addMetricCards([
    [hasLegacyStoredScore ? 'Earlier saved score' : 'Overall website score', score === null ? 'Unavailable' : `${score} / 100`],
    ['Measured observations shown', primaryFindings.length],
  ])
  report.addParagraph(
    score === null
      ? 'Our overall website score is unavailable because PageSpeed did not return a valid result for every required area. We list the observations below separately; they do not imply a numeric overall score.'
      : scoreIsCalculated
          ? `Our overall website score combines Lighthouse/PageSpeed results for Performance (30%), SEO (25%), Accessibility (25%), and Best Practices (20%) (${categoryScores.map(([key, value]) => `${key.replace(/-/g, ' ')} ${value === null ? 'unavailable' : value}`).join(', ')}). It summarizes these measurements; it is not a count of problems or a separate quality certification.`
          : `This earlier report has a saved score of ${score} / 100, but its individual area scores are unavailable, so we cannot confirm how it was calculated.`,
    { size: 8.5 },
  )

  report.addSection('Assessment scope')
  report.addParagraph(
    `Prepared for: ${verifiedBusinessName || hostname}\nWebsite assessed: ${assessedAddress}\nPrepared by: Arlotech Digital Solutions\n\nOur assessment reviewed the website’s loading speed, accessibility, search-related details, and page structure at the time shown above.`,
    { size: 8.5 },
  )

  if (storedCategoryScores.length > 0) {
    report.addSection('PageSpeed scores by area')
    report.addParagraph('SEO means search engine optimization: how easily search engines can find and understand your pages.', { size: 8, color: MUTED })
    report.addMetricCards(
      categoryScores.map(([key, value]) => [
        key.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
        value === null ? 'Unavailable' : `${value} / 100`,
      ]),
    )
  }

  if (auditCompleteness) {
    report.addSection('What we reviewed')
    if (typeof auditCompleteness.completeness_percent === 'number') {
      report.addParagraph(`Inspection coverage: ${auditCompleteness.completeness_percent}%`, { size: 8.5, bold: true })
    }
    if (typeof auditCompleteness.inspected_viewport_count === 'number' &&
      typeof auditCompleteness.requested_viewport_count === 'number') {
      report.addParagraph(
        `PageSpeed viewports inspected: ${auditCompleteness.inspected_viewport_count} of ${auditCompleteness.requested_viewport_count}.`,
        { size: 8 },
      )
    }
    const limitations: string[] = Array.isArray(auditCompleteness.limitations)
      ? auditCompleteness.limitations.filter((item: unknown): item is string => typeof item === 'string')
      : []
    limitations.forEach((limitation) => report.addParagraph(`- ${clientFriendlyAuditText(limitation)}`, { size: 7.5, color: MUTED }))
  }

  report.addSection(`What we found (${findings.length} measured observations)`)
  if (primaryFindings.length === 0) {
    report.addParagraph('No scored Lighthouse issues or direct page-inspection issues were recorded.')
  } else {
    primaryFindings.forEach((finding, index) => {
      report.ensureSpace(20)
      report.addParagraph(`${index + 1}. ${auditFindingTitle(finding)}`, { bold: true, color: NAVY, size: 9.5 })
      const metadata = [
        finding.sourceLabel,
        finding.category?.replace(/-/g, ' '),
        typeof finding.lighthouse_score_pct === 'number'
          ? `Lighthouse audit score ${finding.lighthouse_score_pct}%`
          : null,
      ].filter(Boolean)
      report.addParagraph(metadata.join('  |  '), { size: 7.5, color: TEAL })
      const evidence = finding.display_value || finding.evidence
      if (evidence && evidence !== 'AI-generated') report.addParagraph(`What we found: ${evidence}`, { size: 8 })
      report.addParagraph(`Why it matters: ${auditFindingWhy(finding)}`, { size: 8 })
      const opportunity = formatOpportunity(finding)
      if (opportunity) {
        report.addParagraph(opportunity, { size: 7.5 })
        report.addParagraph(
          'Possible benefit: Lighthouse estimates this opportunity under test conditions. The actual effect for visitors and savings may differ.',
          { size: 7.5, color: MUTED },
        )
      } else if (finding.sourceLabel === 'Measured') {
        report.addParagraph('No quantified savings were reported for this Lighthouse finding.', { size: 7.5, color: MUTED })
      }
      if (finding.recommended_fix || finding.sourceLabel === 'Measured') {
        const auditId = finding.audit_id || finding.id?.replace(/^ps-/, '') || ''
        const recommendation = finding.sourceLabel === 'Measured'
          ? auditFindingRecommendation({ ...finding, recommended_fix: lighthouseRecommendation(auditId, finding.title || 'this issue') })
          : auditFindingRecommendation(finding)
        if (recommendation) {
          report.addParagraph(`What we recommend: ${clientFriendlyAuditText(recommendation)}`, { size: 8, bold: true })
          report.addParagraph(`Finding ${index + 1} of ${primaryFindings.length}`, { size: 7.5, color: MUTED })
        }
      }
      const resources = finding.affected_resources?.filter(Boolean).slice(0, 3) ?? []
      for (const resource of resources) {
        report.addParagraph(`Affected file or page address: ${resource}`, { size: 7, color: MUTED, indent: 3 })
      }
      report.y += 1
    })
  }

  report.addSection(`Possible improvements to review (${optimizationOpportunities.length} estimated opportunities)`)
  if (optimizationOpportunities.length === 0) {
    report.addParagraph('No separately classified Lighthouse optimization opportunities were recorded.')
  } else {
    report.addParagraph(
      'These are potential improvements, not confirmed defects. Savings are Lighthouse estimates under test conditions.',
      { size: 8, color: MUTED },
    )
    optimizationOpportunities.forEach((finding, index) => {
      report.ensureSpace(18)
      report.addParagraph(`${index + 1}. ${auditFindingTitle(finding)}`, { bold: true, color: NAVY, size: 9 })
      report.addParagraph(`Possible improvement (Lighthouse estimate)  |  ${finding.category?.replace(/-/g, ' ') || 'PageSpeed'}`, {
        size: 7.5,
        color: TEAL,
      })
      report.addParagraph(`What we found: ${finding.display_value || finding.evidence}`, { size: 8 })
      report.addParagraph(`Why it matters: ${auditFindingWhy(finding)}`, { size: 8 })
      const opportunity = formatOpportunity(finding)
      if (opportunity) report.addParagraph(opportunity, { size: 7.5, color: MUTED })
      report.addParagraph(`What we recommend: ${clientFriendlyAuditText(auditFindingRecommendation(finding))}`, { size: 8, bold: true })
      for (const resource of finding.affected_resources?.filter(Boolean).slice(0, 3) ?? []) {
        report.addParagraph(`Affected file or page address: ${resource}`, { size: 7, color: MUTED, indent: 3 })
      }
    })
  }

  if (additionalRecommendations.length > 0 || aiRecommendations.length > 0) {
    report.addSection(`Additional ideas to consider (${additionalRecommendations.length + aiRecommendations.length})`)
    report.addParagraph(
      'These are ideas from our website review tools, not measured findings or required changes. We recommend checking each one against the fully loaded website, its settings, and your business goals before acting.',
      { size: 8, color: MUTED },
    )
    aiRecommendations.forEach((suggestion) => {
      const clientSuggestion = clientFriendlyAuditText(suggestion)
      report.addParagraph(
        /^we recommend\b/i.test(clientSuggestion) ? clientSuggestion : `We recommend reviewing this suggestion: ${clientSuggestion}`,
        { size: 8, bold: true },
      )
    })
    additionalRecommendations.forEach((finding) => {
      report.addParagraph(`What we found: ${auditFindingTitle(finding)}`, { size: 8, bold: true })
      report.addParagraph(`Why it may matter: ${auditFindingWhy(finding)}`, { size: 7.5, color: MUTED, indent: 3 })
      report.addParagraph(`What we recommend: ${clientFriendlyAuditText(auditFindingRecommendation(finding))}`, { size: 8 })
    })
  }

  if (visualAudit) {
    report.addSection(`Visual review to validate (${visualObservations.length} observations)`)
    report.addParagraph(
      'We reviewed screenshots of the first page load. These tool-assisted observations are not measured problems and should be confirmed by a person. We did not test menus, forms, or other controls.',
      { size: 8, color: MUTED },
    )
    if (visualAudit.discovered_page_count === 1) {
      report.addParagraph(
        'We did not find links to other pages in the initial HTML. Pages added later by JavaScript may need a separate browser review.',
        { size: 7.5, color: MUTED },
      )
    }
    if (visualPages.length === 0) {
      report.addParagraph('No screenshots were available for this review.')
    } else {
      const savedCount = visualPages.filter((page: any) => typeof page.image_path === 'string').length
      report.addParagraph(`Screenshots saved: ${savedCount} of ${visualPages.length} attempted page/viewports.`)
      visualPages.forEach((page: any) => {
        report.addParagraph(
          `${page.page_label || 'Page'} (${page.viewport || 'unknown screen size'}): ${page.page_url || 'URL unavailable'}`,
          { size: 7.5, color: MUTED },
        )
        if (page.error) report.addParagraph(`Capture note: ${page.error}`, { size: 7.5, color: MUTED })
      })
    }
    if (visualObservations.length === 0) {
      report.addParagraph(visualPages.some((page: any) => typeof page.image_path === 'string')
        ? 'We did not identify clear visual problems in the saved screenshots. This does not confirm that every screen size or control works correctly.'
        : 'No visual observations are available because no screenshot was saved. The page appearance was not assessed.')
    } else {
      visualObservations.forEach((observation: any, index: number) => {
        report.ensureSpace(15)
        report.addParagraph(`${index + 1}. ${clientFriendlyAuditText(observation.title || 'Visual observation')}`, {
          bold: true,
          color: NAVY,
          size: 9,
        })
        report.addParagraph(
          `${observation.viewport || 'unknown screen size'} | ${observation.severity || 'unrated'} priority | ${Math.round((observation.confidence || 0) * 100)}% confidence from our tools`,
          { size: 7.5, color: TEAL },
        )
        report.addParagraph(`What we noticed: ${clientFriendlyAuditText(observation.evidence || 'No visual evidence summary was returned.')}`, { size: 8 })
        report.addParagraph(
          `Why it may matter: ${observation.why_it_matters
            ? clientFriendlyAuditText(observation.why_it_matters)
            : 'If confirmed, this may affect how visitors see or use this part of the page.'}`,
          { size: 8 },
        )
        if (observation.page_url) report.addParagraph(`Page: ${observation.page_url}`, { size: 7.5, color: MUTED })
        report.addParagraph(
          `What we recommend: ${observation.recommended_fix
            ? clientFriendlyAuditText(observation.recommended_fix)
            : 'We recommend confirming this observation on the live page before making changes.'}`,
          { size: 8, bold: true },
        )
      })
    }
  }

  if (positives.length > 0) {
    const measuredPositives = positives.filter((item) =>
      typeof item === 'object' && item.evidence !== 'AI-generated',
    )
    if (measuredPositives.length > 0) {
      report.addSection('What is working well')
      measuredPositives.slice(0, 4).forEach((item) => {
        report.addParagraph(`- ${typeof item === 'string' ? item : item.title || 'Positive observation'}`, { size: 8 })
        if (typeof item === 'object' && item.evidence) {
          report.addParagraph(item.evidence, { size: 7.5, color: MUTED, indent: 3 })
        }
      })
    }
  }

  report.addSection('Conclusion and next steps')
  const quantifiedFindings = findings.filter(
    (finding) => (finding.opportunity_ms ?? 0) > 0 || (finding.opportunity_bytes ?? 0) > 0,
  )
  if (quantifiedFindings.length > 0) {
    const opportunities = quantifiedFindings.slice(0, 3).map((finding) => {
      const estimate = formatOpportunity(finding)
      return `${auditFindingTitle(finding)}${estimate ? ` (${estimate.replace('Estimated opportunity: ', '')})` : ''}`
    })
    report.addParagraph(
      `Our assessment recorded these estimated improvement opportunities: ${opportunities.join('; ')}. These are Lighthouse estimates, not guaranteed results. We recommend checking the listed resources and prioritizing changes that fit your business goals.`,
      { size: 8.5 },
    )
  } else {
    report.addParagraph(
      'Our assessment did not record estimated savings. We recommend reviewing the observations above against your website goals before making changes.',
      { size: 8.5 },
    )
  }
  report.addParagraph(
    'We would be happy to discuss the findings and help determine which improvements are appropriate for your website.',
    { size: 8.5 },
  )

  report.addParagraph(
    'How we assessed the site: We used Lighthouse/PageSpeed measurements and inspected the page HTML at the time shown above. Results can vary by device, network, location, and page state. We recommend confirming the affected files or pages before making changes.',
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

export function createWebsiteAnalysisPdfBase64(
  analysis: Record<string, any>,
  preparedFor?: { businessName: string; verified: boolean } | null,
) {
  return buildWebsiteAnalysisPdf(analysis, preparedFor).report.toBase64()
}
