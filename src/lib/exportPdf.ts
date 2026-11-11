import jsPDF from 'jspdf'
import {
  calculateUnifiedWebsiteScore,
  calculateTechnicalHealthScore,
  LIGHTHOUSE_CATEGORY_WEIGHTS,
  rateLighthouseFinding,
  unifiedScoreCategories,
  UNIFIED_WEBSITE_SCORE_VERSION,
} from '@/lib/websiteAudit'
import {
  auditFindingRecommendation,
  auditFindingBusinessImpact,
  auditFindingBusinessTitle,
  clientFriendlyAuditText,
} from '@/lib/auditReportLanguage'
import { ARLOTECH_BLACKSITE_PDF_LOGO_FILE, loadArlotechLogoDataUrl } from '@/lib/brandAssets'

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

interface PdfScreenshot {
  data: string
  format: 'PNG' | 'JPEG'
  label: string
}

async function loadAuditScreenshots(analysis: Record<string, any>): Promise<PdfScreenshot[]> {
  const record = analysis?.record || analysis || {}
  const pages = Array.isArray(record.analysis_details?.screenshot_review?.pages)
    ? record.analysis_details.screenshot_review.pages as Array<Record<string, unknown>>
    : []
  const userId = typeof record.user_id === 'string' ? record.user_id : ''
  const auditId = typeof record.id === 'string' ? record.id : ''
  if (!userId || !auditId) return []

  const candidates = pages.filter((page) =>
    typeof page.image_path === 'string' &&
    page.image_path.startsWith(`${userId}/${auditId}/`) &&
    /\.(?:jpe?g|png)$/i.test(page.image_path),
  ).slice(0, 2)
  if (!candidates.length) return []

  const { supabase } = await import('@/lib/supabase')
  const screenshots = await Promise.all(candidates.map(async (page): Promise<PdfScreenshot | null> => {
    try {
      const path = String(page.image_path)
      const { data: signed, error } = await supabase.storage
        .from('website-audit-screenshots')
        .createSignedUrl(path, 120)
      if (error || !signed?.signedUrl) return null

      const response = await fetch(signed.signedUrl)
      if (!response.ok) return null
      const blob = await response.blob()
      if (!['image/jpeg', 'image/png'].includes(blob.type) || blob.size <= 0 || blob.size > 1_000_000) return null
      if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null

      const bitmap = await createImageBitmap(blob)
      const scale = Math.min(1, 1500 / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d')
      if (!context) {
        bitmap.close()
        return null
      }
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()

      const toJpeg = (quality: number) => new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', quality)
      })
      let compressed = await toJpeg(0.62)
      if (!compressed || compressed.size > 130_000) compressed = await toJpeg(0.46)
      if (!compressed || compressed.size > 130_000) return null

      const bytes = new Uint8Array(await compressed.arrayBuffer())
      let binary = ''
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
      }
      const format = 'JPEG'
      const viewport = typeof page.viewport === 'string' ? page.viewport : 'view'
      const pageLabel = typeof page.page_label === 'string' ? page.page_label : 'Website page'
      return {
        data: `data:image/jpeg;base64,${btoa(binary)}`,
        format,
        label: `${pageLabel} - ${viewport}`,
      }
    } catch {
      return null
    }
  }))

  return screenshots.filter((item): item is PdfScreenshot => item !== null)
}

async function loadPdfBrandLogo(): Promise<PdfBrandLogo> {
  return { data: await loadArlotechLogoDataUrl(ARLOTECH_BLACKSITE_PDF_LOGO_FILE), format: 'PNG' }
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
  sourceLabel: 'Measured' | 'Page inspection' | 'Unverified'
  dedupeKey: string
}

function displayDate(value?: string | null) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString()
}

function auditPdfText(value: unknown, limit = 1200) {
  if (typeof value !== 'string') return ''
  if (/BOOT_ERROR|Edge Function returned|failed because the audit/i.test(value)) {
    return 'One or more screenshots could not be saved or analyzed.'
  }
  if (/invalid markup/i.test(value)) {
    return 'The page structure may make some content harder to interpret.'
  }
  return clientFriendlyAuditText(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\b(?:Lighthouse|PageSpeed)\b/gi, 'the website check')
    .replace(/\bJavaScript\b/gi, 'website code')
    .replace(/\bCSS\b/gi, 'styling files')
    .replace(/\bSpeed Index\b/gi, 'page display speed')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit)
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
      doc.addImage(logo.data, logo.format, LEFT, 8, 26, 18)
    }
    doc.setTextColor(...WHITE)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('ARLOTECH DIGITAL SOLUTIONS', LEFT + (logo ? 30 : 8), 15)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(brand, LEFT + (logo ? 30 : 8), 21)
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

  const addWebsiteIssueCard = (
    index: number,
    title: string,
    impact: string,
    evidence?: string,
    recommendation?: string,
    evidenceLabel = 'Review evidence',
  ) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    const titleLines = doc.splitTextToSize(title, CONTENT_WIDTH - 22)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const impactLines = doc.splitTextToSize(impact, CONTENT_WIDTH - 22)
    const evidenceLines = evidence
      ? doc.splitTextToSize(`${evidenceLabel}: ${evidence}`, CONTENT_WIDTH - 16)
      : []
    const recommendationLines = recommendation
      ? doc.splitTextToSize(`Recommended improvement: ${recommendation}`, CONTENT_WIDTH - 16)
      : []
    const cardHeight = 12 + titleLines.length * 5 + 4 + impactLines.length * 4.5 + 7 +
      (evidenceLines.length ? 7 + evidenceLines.length * 4 : 0) +
      (recommendationLines.length ? 7 + recommendationLines.length * 4 : 0)
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
    let detailY = impactLabelY + 5 + impactLines.length * 4.5 + 4
    if (evidenceLines.length) {
      doc.setTextColor(...SLATE)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.text(evidenceLines, LEFT + 8, detailY)
      detailY += evidenceLines.length * 4 + 3
    }
    if (recommendationLines.length) {
      doc.setTextColor(...SLATE)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.text(recommendationLines, LEFT + 8, detailY)
    }
    y += cardHeight + 5
  }

  const addScreenshotGallery = (screenshots: PdfScreenshot[]) => {
    if (!screenshots.length) return
    addSection('Website screenshots')
    const gap = 5
    const columnWidth = (CONTENT_WIDTH - gap) / 2
    const imageMaxHeight = 48
    const cardHeight = 61
    if (!ensureSpace(cardHeight + 4)) return

    screenshots.slice(0, 2).forEach((screenshot, index) => {
      const x = LEFT + index * (columnWidth + gap)
      doc.setFillColor(...LIGHT)
      doc.setDrawColor(226, 232, 240)
      doc.roundedRect(x, y, columnWidth, cardHeight, 2, 2, 'FD')
      const properties = doc.getImageProperties(screenshot.data)
      const scale = Math.min((columnWidth - 8) / properties.width, imageMaxHeight / properties.height)
      const imageWidth = properties.width * scale
      const imageHeight = properties.height * scale
      const imageX = x + (columnWidth - imageWidth) / 2
      const imageY = y + 3 + (imageMaxHeight - imageHeight) / 2
      doc.addImage(screenshot.data, screenshot.format, imageX, imageY, imageWidth, imageHeight)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.setTextColor(...NAVY)
      doc.text(screenshot.label.slice(0, 48), x + 4, y + 57)
    })
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

  let pageFooterAdded = false
  const addPageFooter = () => {
    if (pageFooterAdded) return

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
      doc.text(`Page ${page} of ${pageCount}`, RIGHT, PAGE_HEIGHT - 8, { align: 'right' })
    }
    pageFooterAdded = true
  }

  const finish = (filename: string) => {
    addPageFooter()
    doc.save(filename)
  }

  const toBase64 = () => {
    addPageFooter()
    return doc.output('datauristring').split(',')[1]
  }

  return {
    doc,
    addMetricCards,
    addWebsiteHealthCard,
    addWebsiteIssueCard,
    addScreenshotGallery,
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
      source === 'Measured' ? 3 : source === 'Page inspection' ? 2 : 1
    if (!existing || sourceRank(normalized.sourceLabel) > sourceRank(existing.sourceLabel)) {
      unique.set(dedupeKey, normalized)
    }
  }
  return [...unique.values()]
}

function buildConsultantWebsiteAnalysisPdf(
  analysis: Record<string, any>,
  preparedFor?: {
    businessName: string
    verified: boolean
    contactName?: string
    email?: string | null
  } | null,
  logo?: PdfBrandLogo,
  screenshots: PdfScreenshot[] = [],
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
  const unifiedMetadata = rec.analysis_details?.unified_score
  const unifiedScore = unifiedMetadata?.version === UNIFIED_WEBSITE_SCORE_VERSION
      ? calculateUnifiedWebsiteScore(unifiedScoreCategories(
          scoreInputs,
          rec.analysis_details?.visual_audit?.visual_score,
        ))
      : null
  const score = unifiedScore
      ? unifiedScore.score
      : calculateTechnicalHealthScore(scoreInputs) ?? legacyScore
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
        finding,
      }
    })
  const selectedTitles = new Set<string>()
  const topFindings = measuredCandidates
    .sort((left, right) => right.rank - left.rank)
    .filter((finding) => {
      const titleKey = finding.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
      if (!titleKey || selectedTitles.has(titleKey)) return false
      selectedTitles.add(titleKey)
      return true
    })
    .slice(0, 4)
  const visualAudit = rec.analysis_details?.visual_audit
  const allVisualFindings = Array.isArray(visualAudit?.findings) ? visualAudit.findings : []
  const hasAnyFindings = topFindings.length > 0 || allVisualFindings.length > 0
  const report = createReport(
    'Website review',
    `Reviewed ${displayDate(rec.analyzed_at)}  |  Arlotech Digital Solutions`,
    'WEBSITE REVIEW',
    4,
    logo,
  )
  const scoreSummary = !hasAnyFindings
    ? score === null
      ? 'No customer issue was confirmed in the available review. We could not calculate a reliable overall score.'
      : 'The available checks did not confirm a customer issue that needs attention.'
    : score === null
      ? 'A reliable overall score was not available, so this report focuses on the customer issues supported by the review.'
      : score >= 90
        ? 'Your website has a strong overall starting point. A few focused changes may make the customer experience even smoother.'
        : score >= 80
          ? 'Your website has a good overall foundation. The focused improvements below may make the experience clearer and easier to use.'
          : score >= 70
            ? 'Your website has a reasonable foundation, with a few areas worth improving to make key information easier to use.'
            : score >= 60
              ? 'This review found several areas that deserve attention. The priorities below focus on the most useful changes to consider first.'
              : 'This review found areas that may be getting in customers’ way. Addressing the highest-priority points could make it easier to reach your business.'
  const experienceSummary = !hasAnyFindings
    ? 'This report is a helpful snapshot of the areas reviewed, not a guarantee of how every visitor experiences the website.'
    : `The review highlights ${topFindings.length + allVisualFindings.length} area${topFindings.length + allVisualFindings.length === 1 ? '' : 's'} worth reviewing across the available technical and visual checks.`
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
  const recipientLabel = [
    preparedFor?.contactName?.trim(),
    preparedFor?.verified ? preparedFor.businessName.trim() : '',
  ].filter(Boolean).join(' at ')
  const recipient = recipientLabel || preparedFor?.email?.trim()
  if (recipient) {
    report.addParagraph(
      `Prepared for: ${recipient}${preparedFor?.email?.trim() ? ` | ${preparedFor.email.trim()}` : ''}`,
      { size: 8.5, color: NAVY },
    )
  }
  report.addWebsiteHealthCard(score, scoreSummary, experienceSummary)
  if (unifiedScore?.interpretation) {
    report.addParagraph(
      `${unifiedScore.interpretation}${unifiedScore.provisional ? ' — provisional, because one or more scoring categories were unavailable.' : ''}`,
      { size: 8.5, bold: true, color: NAVY },
    )
  } else if (score !== null) {
    report.addParagraph(
      'This historical report retains its saved technical-only score methodology; it has not been recalculated using the newer unified weights.',
      { size: 8, color: MUTED },
    )
  }
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
  const analysisDetails = rec.analysis_details && typeof rec.analysis_details === 'object'
    ? rec.analysis_details as Record<string, any>
    : {}
  const coverage = analysisDetails.audit_completeness
  const screenshotReview = analysisDetails.screenshot_review
  if (coverage && typeof coverage === 'object') {
    report.addSection('Review coverage and limitations')
    const coverageParts = [
      typeof coverage.discovered_page_count === 'number'
        ? `${coverage.discovered_page_count} page${coverage.discovered_page_count === 1 ? '' : 's'} reviewed`
        : null,
      typeof coverage.inspected_viewport_count === 'number' && typeof coverage.requested_viewport_count === 'number'
        ? `${coverage.inspected_viewport_count} of ${coverage.requested_viewport_count} performance test viewports inspected`
        : null,
    ].filter(Boolean)
    if (coverageParts.length) report.addParagraph(coverageParts.join(' | '), { bold: true, color: NAVY })
    report.addParagraph(
      'This describes the available audit scope; it does not mean every page or interactive feature on the website was reviewed.',
      { size: 7.5, color: MUTED },
    )
    if (typeof coverage.saved_screenshot_count === 'number') {
      report.addParagraph(
        `${coverage.saved_screenshot_count} screenshot${coverage.saved_screenshot_count === 1 ? '' : 's'} saved for interface review.`,
      )
    }
    if (Array.isArray(coverage.limitations) && coverage.limitations.length) {
      report.addParagraph('Review limitations:', { bold: true, color: NAVY })
      coverage.limitations.slice(0, 2).forEach((limitation: unknown) => {
        if (typeof limitation === 'string' && limitation.trim()) {
          report.addParagraph(`- ${auditPdfText(limitation)}`, { size: 8, indent: 4 })
        }
      })
    }
  }
  if (screenshotReview && typeof screenshotReview === 'object') {
    const pages = Array.isArray(screenshotReview.pages) ? screenshotReview.pages : []
    const savedCount = pages.filter((page: Record<string, unknown>) => typeof page.image_path === 'string' && page.image_path).length
    if (savedCount > 0) {
      report.addParagraph(
        `${savedCount} of ${pages.length} reviewed page/device views had saved screenshots. Static screenshots do not verify interactive controls.`,
        { size: 7.5 },
      )
    }
  }
  const htmlInspection = analysisDetails.html_inspection
  if (
    htmlInspection &&
    typeof htmlInspection === 'object' &&
    htmlInspection.discovered_same_origin_navigation_count === 0
  ) {
    report.addParagraph(
      'The initial HTML did not expose links to other pages, so JavaScript-added pages may not be included in this review.',
      { size: 7.5 },
    )
  }

  report.addSection('User interface design assessment')
  if (visualAudit?.status === 'completed' || visualAudit?.status === 'partial') {
    report.addParagraph(`User interface design score: ${visualAudit.visual_score ?? 'Not available'}/100 (${visualAudit.status} screenshot coverage).`, { bold: true, color: NAVY })
    report.addParagraph(auditPdfText(visualAudit.score_explanation || visualAudit.assessment?.summary) || 'Design assessment explanation was not recorded.')
    const assessment = visualAudit.assessment && typeof visualAudit.assessment === 'object'
      ? visualAudit.assessment as Record<string, unknown>
      : {}
    const assessmentAreas: Array<[string, unknown]> = [
      ['Visual hierarchy', assessment.visual_hierarchy],
      ['Typography', assessment.typography],
      ['Mobile presentation', assessment.mobile_presentation],
    ]
    assessmentAreas.forEach(([label, value]) => {
      if (typeof value === 'string' && value.trim() && value !== 'Not assessed') {
        report.addParagraph(`${label}: ${auditPdfText(value)}`, { size: 8 })
      }
    })
    if (Array.isArray(assessment.most_important_improvements) && assessment.most_important_improvements.length) {
      report.addParagraph('Priority design improvements:', { bold: true, color: NAVY })
      assessment.most_important_improvements.slice(0, 3).forEach((item: unknown, index: number) => {
        if (typeof item === 'string' && item.trim()) {
          report.addParagraph(`${index + 1}. ${auditPdfText(item)}`, { size: 8, indent: 4 })
        }
      })
    }
    const visualFindings = Array.isArray(visualAudit.findings) ? visualAudit.findings : []
    if (!visualFindings.length) {
      report.addParagraph('No significant interface issues were identified in the screenshots that were available.', { color: NAVY })
    } else {
      visualFindings.slice(0, 3).forEach((finding: Record<string, any>, index: number) => {
        const location = [
          auditPdfText(finding.page_label),
          auditPdfText(finding.device),
        ].filter(Boolean).join(' | ')
        report.addWebsiteIssueCard(
          index + 1,
          `${auditPdfText(finding.title) || 'Interface observation'}${location ? ` (${location})` : ''}${finding.severity ? ` - ${String(finding.severity).toUpperCase()}` : ''}`,
          auditPdfText(finding.user_impact, 300) || 'This may affect how easily visitors understand or use this part of the page.',
          auditPdfText(finding.evidence, 300),
          auditPdfText(finding.recommendation, 300),
          'Screenshot evidence',
        )
      })
      if (visualFindings.length > 3) {
        report.addParagraph(`${visualFindings.length - 3} additional lower-priority visual observation(s) are omitted from this concise prospect report.`, { size: 7.5, color: MUTED })
      }
    }
  } else {
    report.addParagraph(visualAudit?.status === 'failed'
      ? `User interface design assessment could not be completed: ${visualAudit.error || 'No error details were recorded.'}`
      : 'User interface design assessment was not available for this audit. No design score or findings have been inferred.')
  }
  report.addScreenshotGallery(screenshots)

  report.addSection(`What we found (${topFindings.length})`)
  if (topFindings.length === 0) {
    report.addParagraph(
      'No confirmed customer friction points were identified in the available review. We do not recommend making changes based on issues this report could not verify.',
      { size: 9, color: NAVY },
    )
  } else {
    topFindings.forEach((finding, index) => {
      const rawEvidence = String(finding.finding.evidence || '')
      const evidence = rawEvidence
        ? auditPdfText(/^Lighthouse reported score/i.test(rawEvidence)
          ? 'The website check flagged this item for review; a specific visitor-facing effect was not confirmed.'
          : rawEvidence, 500)
        : ''
      const sourceRecommendation = String(finding.finding.recommended_fix || '')
      const hasKnownRecommendation = /largest-contentful-paint|\blcp\b|first-contentful-paint|\bfcp\b|total-blocking-time|\btbt\b|cumulative-layout-shift|\bcls\b|render.blocking|unused.javascript|unused.css|server-response-time|document-request-latency|time-to-first-byte|document-title|html-title|meta-description|content-meta|canonical|crawlable|robots\.txt|color-contrast|image-alt|content-alt|font-display|content-h1|\bh1\b|heading-order|doctype|image-aspect-ratio|(?:^|[-_])list(?:[-_]|$)|list.*(?:element|markup|structure)/i
        .test(`${finding.finding.audit_id || ''} ${finding.finding.id || ''} ${finding.finding.title || ''}`)
      const recommendation = auditPdfText(
        /<[^>]+>/.test(String(finding.finding.title || ''))
          ? 'Review the affected list structure in the rendered page and use semantic list elements where appropriate.'
          : hasKnownRecommendation
            ? auditFindingRecommendation(finding.finding)
            : sourceRecommendation || 'Review this item and its page-specific evidence before deciding whether a change would help visitors.',
        500,
      )
      const priorityLabel = typeof finding.finding.priority === 'string' ? ` - ${finding.finding.priority.toUpperCase()} PRIORITY` : ''
      report.addWebsiteIssueCard(index + 1, `${finding.title}${priorityLabel}`, finding.impact, evidence, recommendation)
    })
    if (measuredCandidates.length > topFindings.length) {
      report.addParagraph(
        'Additional lower-priority or overlapping technical observations remain available in the dashboard and are omitted from this concise prospect report.',
        { size: 7.5, color: MUTED },
      )
    }
  }
  // The prospect report intentionally excludes diagnostic-only and estimated opportunities.
  // They remain available in the dashboard for a deeper technical review.

  const positiveObservations = (Array.isArray(rec.positive_observations) ? rec.positive_observations : [])
    .filter((observation: Record<string, unknown>) =>
      !/^(?:speed index|largest contentful paint|first contentful paint|seo|accessibility|best practices|performance)\s*[—-]\s*good\b/i.test(
        typeof observation.title === 'string' ? observation.title : '',
      ),
    )
  if (positiveObservations.length) {
    report.addSection('What is working well')
    positiveObservations.slice(0, 2).forEach((observation: Record<string, unknown>) => {
      const title = typeof observation.title === 'string' ? observation.title : ''
      const evidence = typeof observation.evidence === 'string' ? observation.evidence : ''
      const line = [title, evidence].filter(Boolean).join(' — ')
      if (line) report.addParagraph(auditPdfText(line), { size: 8 })
    })
  }
  const relevantSupport = [...new Set(topFindings.map((finding) => finding.support).filter(Boolean))]
  if (relevantSupport.length) {
    report.addSection('Relevant Arlotech support')
    report.addParagraph(
      `Based on the findings above, Arlotech can discuss focused options for ${relevantSupport.join('; ')}. Any proposed work should be confirmed against your goals and priorities.`,
      { size: 9, color: NAVY },
    )
  }
  const businessImpactParagraph = topFindings.length
    ? 'A clear, dependable website helps protect your reputation and gives potential customers a simpler path from finding your business to getting in touch. The points above show where a small, focused improvement may help.'
    : 'The available review did not confirm a customer issue that needs fixing. Keeping the website clear and dependable can still help protect your reputation and make it easy for customers to get in touch.'
  const contactInvitation =
    'Reply to the email that included this report if you would like to discuss a practical next step.'
  report.addWebsiteContactCard(businessImpactParagraph, contactInvitation, [
    'Email: info@arlotech.com.ng',
    'Website: arlotech.com.ng',
  ])
  const visualObservationCount = Array.isArray(visualAudit?.findings)
    ? Math.min(visualAudit.findings.length, 3)
    : 0
  const shortSummary = topFindings.length || visualObservationCount
    ? `In brief, this review recorded ${topFindings.length} evidence-backed website finding${topFindings.length === 1 ? '' : 's'} and ${visualObservationCount} interface design observation${visualObservationCount === 1 ? '' : 's'}.`
    : 'In brief, no confirmed website findings were recorded in the available review.'
  report.addSection('Short summary')
  report.addParagraph(shortSummary, { size: 9, color: NAVY })

  return {
    report,
    filename: `arlotech-website-report-${rec.id || 'analysis'}.pdf`,
  }
}

export async function exportWebsiteAnalysisPdf(analysis: Record<string, any>) {
  const [logo, screenshots] = await Promise.all([
    loadPdfBrandLogo(),
    loadAuditScreenshots(analysis),
  ])
  const { report, filename } = buildConsultantWebsiteAnalysisPdf(analysis, null, logo, screenshots)
  report.finish(filename)
}

export async function createWebsiteAnalysisPdfBase64(
  analysis: Record<string, any>,
  preparedFor?: {
    businessName: string
    verified: boolean
    contactName?: string
    email?: string | null
  } | null,
) {
  const [logo, screenshots] = await Promise.all([
    loadPdfBrandLogo(),
    loadAuditScreenshots(analysis),
  ])
  return buildConsultantWebsiteAnalysisPdf(analysis, preparedFor, logo, screenshots).report.toBase64()
}
