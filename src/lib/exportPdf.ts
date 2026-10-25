import jsPDF from 'jspdf'

export function exportDashboardPdf(metrics: any, prospects: any[], activity: any[]) {
  const doc = new jsPDF()
  let y = 12
  const ensureSpace = (needed = 8) => { if (y + needed > 285) { doc.addPage(); y = 12 } }
  function addHeading(t: string) { ensureSpace(12); doc.setFontSize(14); doc.setFont('helvetica','bold'); doc.text(t,10,y); y+=8 }
  const para = (t: string, size=11) => { ensureSpace(6); doc.setFontSize(size); doc.setFont('helvetica','normal'); const lines=doc.splitTextToSize(String(t??''),190); doc.text(lines,10,y); y+=lines.length*(size*0.45)+2 }
  const bullet = (t:string) => { ensureSpace(5); doc.setFontSize(11); doc.setFont('helvetica','normal'); const lines=doc.splitTextToSize(`• ${t??''}`,185); doc.text(lines,12,y); y+=lines.length*5+1 }

  addHeading('Dashboard Report')
  addHeading('Metrics')
  if (metrics) {
    for (const [k, v] of Object.entries(metrics)) {
      para(`${k.replace(/_/g, ' ')}: ${v ?? '—'}`)
    }
  }
  doc.setFontSize(14); doc.setFont('helvetica','bold'); doc.text('Recent Prospects', 10, y); y += 8;
  (prospects||[]).forEach((p:any,i:number) => {
    ensureSpace(10)
    bullet(`${i+1}. ${p.name || p.email || 'Prospect'} — ${p.company || ''} (${p.status || 'unknown'})`)
  })
  addHeading('Recent Activity');
  (activity||[]).forEach((a:any) => {
    bullet(`${a.action || a.event || 'Activity'} — ${a.created_at ? new Date(a.created_at).toLocaleString() : ''}`)
  })
  doc.save('dashboard-report.pdf')
}

export function exportRepliesPdf(messages: any[]) {
  const doc = new jsPDF()
  let y = 12
  const ensureSpace = (needed = 8) => { if (y + needed > 285) { doc.addPage(); y = 12 } }
  function addHeading(t: string) { ensureSpace(12); doc.setFontSize(14); doc.setFont('helvetica','bold'); doc.text(t,10,y); y+=8 }
  const para = (t: string, size=11) => { ensureSpace(6); doc.setFontSize(size); doc.setFont('helvetica','normal'); const lines=doc.splitTextToSize(String(t??''),190); doc.text(lines,10,y); y+=lines.length*(size*0.45)+2 }

  addHeading('Replies Report')
  para(`Total messages: ${(messages||[]).length}`)
  ;(messages||[]).forEach((m:any,i:number) => {
    ensureSpace(16)
    addHeading(`${i+1}. ${m.subject || 'No subject'}`)
    para(`Status: ${m.status || 'unknown'}`)
    para(`Received: ${m.received_at ? new Date(m.received_at).toLocaleString() : 'Pending'}`)
    if (m.body) para(`Body: ${String(m.body).slice(0,500)}`)
  })
  doc.save('replies-report.pdf')
}
export function exportWebsiteAnalysisPdf(analysis: any) {
  const rec = analysis?.record || analysis || {}
  const doc = new jsPDF()
  let y = 12

  const ensureSpace = (needed = 10) => {
    if (y + needed > 285) {
      doc.addPage()
      y = 12
    }
  }

  function addHeading(text: string) {
    ensureSpace(12)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(text, 10, y)
    y += 8
  }

  const para = (text: string, size = 11) => {
    ensureSpace(6)
    doc.setFontSize(size)
    doc.setFont('helvetica', 'normal')
    const lines = doc.splitTextToSize(String(text ?? ''), 190)
    doc.text(lines, 10, y)
    y += lines.length * (size * 0.45) + 3
  }

  const bullet = (text: string) => {
    ensureSpace(6)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    const lines = doc.splitTextToSize(`• ${text ?? ''}`, 185)
    doc.text(lines, 12, y)
    y += lines.length * 5 + 1
  }

  addHeading('Website Intelligence Report')
  para(`URL: ${rec.website_url ?? rec.url ?? 'N/A'}`)
  para(`Analyzed: ${rec.analyzed_at ? new Date(rec.analyzed_at).toLocaleString() : 'N/A'}`)
  para(`Provider: ${rec.analysis_provider ?? 'N/A'}`)
  para(`Status: ${rec.analysis_status ?? 'N/A'}`)

  addHeading('Overall Score')
  para(`${rec.overall_score ?? 'N/A'} / 100`)

  if (rec.category_scores && Object.keys(rec.category_scores).length) {
    addHeading('Category Scores')
    for (const [k, v] of Object.entries(rec.category_scores)) {
      para(`${k.replace(/-/g, ' ')}: ${v ?? '—'}`, 11)
    }
  }

  const findings = rec.findings || []
  addHeading(`Findings (${findings.length})`)
  if (findings.length === 0) {
    para('No findings recorded.')
  } else {
    findings.forEach((f: any, i: number) => {
      ensureSpace(12)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text(`${i + 1}. ${f.title ?? 'Untitled'}`, 10, y)
      y += 5
      if (f.priority) para(`Priority: ${f.priority}`, 10)
      if (f.evidence) para(`Evidence: ${f.evidence}`, 10)
      if (f.explanation) para(`Explanation: ${f.explanation}`, 10)
      if (f.recommended_fix) para(`Recommended fix: ${f.recommended_fix}`, 10)
    })
  }

  const positives = rec.positive_observations || []
  if (positives.length) {
    addHeading(`Positive Observations (${positives.length})`)
    positives.forEach((p: any) => bullet(typeof p === 'string' ? p : (p.title || p)))
  }

  doc.save(`website-analysis-${rec.id || 'report'}.pdf`)
}
