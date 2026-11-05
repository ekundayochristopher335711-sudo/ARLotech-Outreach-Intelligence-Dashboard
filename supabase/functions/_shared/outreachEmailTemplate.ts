function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!)
}

export function sentEmailBody(message: string, postalAddress: string) {
  return `${message.trim()}\n\n---\nIf you do not want further outreach, reply to this email and let us know.\n\n${postalAddress.trim()}`
}

export function outreachEmailHtml(message: string, postalAddress: string, includeInlineLogo = false) {
  const paragraphs = message.trim().split(/\n\s*\n/).map((paragraph) => {
    const text = paragraph.trim()
    if (/attached (?:a short|the short) website review/i.test(text)) {
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 22px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px">
  <tr><td style="padding:16px 18px">
    <div style="color:#0f766e;font:700 13px/1.4 Arial,Helvetica,sans-serif">Your website review PDF is attached</div>
    <div style="margin-top:5px;color:#475569;font:13px/1.6 Arial,Helvetica,sans-serif">We have included a short report with more detail. Look for the website-review PDF attached to this email.</div>
  </td></tr>
</table>`
    }
    return `<p style="margin:0 0 16px;color:#334155;font:15px/1.7 Arial,Helvetica,sans-serif;white-space:pre-line">${escapeHtml(text)}</p>`
  }).join('')

  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f1f5f9">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">A brief note from Arlotech Digital Solutions</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 12px">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-collapse:separate;border-spacing:0;border-radius:12px;overflow:hidden">
          <tr><td style="background:#0f1f36;padding:23px 32px">
            ${includeInlineLogo
              ? '<img src="cid:arlotech-logo" width="190" alt="Arlotech Digital Solutions" style="display:block;width:190px;max-width:100%;height:auto;border:0">'
              : '<div style="color:#ffffff;font:700 18px/1.3 Arial,Helvetica,sans-serif;letter-spacing:1.2px">ARLOTECH</div><div style="margin-top:4px;color:#a8c7c7;font:11px/1.4 Arial,Helvetica,sans-serif;letter-spacing:1.5px">DIGITAL SOLUTIONS</div>'}
          </td></tr>
          <tr><td style="height:4px;background:#0d766e;font-size:0;line-height:0">&nbsp;</td></tr>
          <tr><td style="padding:32px">${paragraphs}</td></tr>
          <tr><td style="padding:0 32px 28px">
            <div style="border-top:1px solid #e2e8f0;padding-top:18px;color:#64748b;font:12px/1.6 Arial,Helvetica,sans-serif">
              If you do not want further outreach, reply to this email and let us know.<br>
              ${escapeHtml(postalAddress.trim())}
            </div>
          </td></tr>
        </table>
        <div style="padding:16px 8px 0;color:#94a3b8;font:11px/1.5 Arial,Helvetica,sans-serif">Arlotech Digital Solutions</div>
      </td></tr>
    </table>
  </body>
</html>`
}

export function replyEmailHtml(message: string) {
  const paragraphs = message.trim().split(/\n\s*\n/).map((paragraph) =>
    `<p style="margin:0 0 16px;color:#334155;font:15px/1.7 Arial,Helvetica,sans-serif;white-space:pre-line">${escapeHtml(paragraph.trim())}</p>`,
  ).join('')

  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f1f5f9">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 12px">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-collapse:separate;border-spacing:0;border-radius:12px;overflow:hidden">
          <tr><td style="background:#0f1f36;padding:23px 32px">
            <div style="color:#ffffff;font:700 18px/1.3 Arial,Helvetica,sans-serif;letter-spacing:1.2px">ARLOTECH</div>
            <div style="margin-top:4px;color:#a8c7c7;font:11px/1.4 Arial,Helvetica,sans-serif;letter-spacing:1.5px">DIGITAL SOLUTIONS</div>
          </td></tr>
          <tr><td style="height:4px;background:#0d766e;font-size:0;line-height:0">&nbsp;</td></tr>
          <tr><td style="padding:32px">${paragraphs}</td></tr>
          <tr><td style="padding:0 32px 24px;color:#64748b;font:12px/1.6 Arial,Helvetica,sans-serif">Arlotech Digital Solutions</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}
