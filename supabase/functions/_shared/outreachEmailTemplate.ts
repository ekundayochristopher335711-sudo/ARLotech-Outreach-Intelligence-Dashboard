function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!)
}

export function sentEmailBody(message: string, postalAddress: string, unsubscribeUrl: string) {
  return `${message.trim()}\n\n---\nUnsubscribe: ${unsubscribeUrl}\n\n${postalAddress.trim()}`
}

export function outreachEmailHtml(
  message: string,
  postalAddress: string,
  unsubscribeUrl: string,
  includeInlineLogo = false,
  senderName = '',
) {
  const paragraphs = message.trim().split(/\n\s*\n/).map((paragraph) => {
    const text = paragraph.trim()
    if (/attached (?:a short|the short) website review/i.test(text)) {
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 22px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px">
  <tr><td style="padding:17px 19px;border-left:4px solid #0f766e;border-radius:8px">
    <div style="color:#0f766e;font:700 14px/1.45 Arial,Helvetica,sans-serif">Your website review is attached</div>
    <div style="margin-top:5px;color:#475569;font:13px/1.65 Arial,Helvetica,sans-serif">A concise report with more detail is included as a PDF attachment to this email.</div>
  </td></tr>
</table>`
    }
    return `<p style="margin:0 0 18px;color:#26364a;font:16px/1.75 Arial,Helvetica,sans-serif;white-space:pre-line">${escapeHtml(text)}</p>`
  }).join('')

  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f1f5f9">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">A brief note from Arlotech Digital Solutions</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:28px 14px">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border-collapse:separate;border-spacing:0;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
          <tr><td style="background:#ffffff;padding:22px 28px;border-bottom:1px solid #e8edf2">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
            ${includeInlineLogo
              ? '<td valign="middle" style="padding-right:10px"><img src="cid:arlotech-logo" width="36" height="24" alt="Arlotech" style="display:block;width:36px!important;height:24px!important;max-width:36px;max-height:24px;object-fit:contain;border:0"></td>'
              : ''}
                <td valign="middle">
                  <div style="color:#10243a;font:700 15px/1.3 Arial,Helvetica,sans-serif;letter-spacing:1.2px">ARLOTECH</div>
                  <div style="margin-top:3px;color:#64748b;font:10px/1.4 Arial,Helvetica,sans-serif;letter-spacing:1.5px">DIGITAL SOLUTIONS</div>
                  ${senderName.trim()
                    ? `<div style="margin-top:6px;color:#475569;font:12px/1.4 Arial,Helvetica,sans-serif">Sent by ${escapeHtml(senderName.trim())}</div>`
                    : ''}
                </td>
              </tr>
            </table>
          </td></tr>
          <tr><td style="height:2px;background:#f5bf24;font-size:0;line-height:0">&nbsp;</td></tr>
          <tr><td style="padding:26px 28px 14px">${paragraphs}</td></tr>
          <tr><td style="padding:0 28px 24px">
            <div style="border-top:1px solid #e8edf2;padding-top:14px;color:#64748b;font:12px/1.7 Arial,Helvetica,sans-serif">
              <a href="${escapeHtml(unsubscribeUrl)}" style="color:#475569;text-decoration:underline">Unsubscribe</a><br>
              <span style="color:#475569">${escapeHtml(postalAddress.trim())}</span>
            </div>
          </td></tr>
        </table>
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
          <tr><td style="background:#10243a;padding:22px 32px">
            <div style="color:#ffffff;font:700 17px/1.3 Arial,Helvetica,sans-serif;letter-spacing:1.4px">ARLOTECH</div>
            <div style="margin-top:4px;color:#b9c9d5;font:10px/1.4 Arial,Helvetica,sans-serif;letter-spacing:1.7px">DIGITAL SOLUTIONS</div>
          </td></tr>
          <tr><td style="height:3px;background:#f5bf24;font-size:0;line-height:0">&nbsp;</td></tr>
          <tr><td style="padding:34px 36px 22px">${paragraphs}</td></tr>
          <tr><td style="padding:0 36px 28px;color:#64748b;font:12px/1.6 Arial,Helvetica,sans-serif">Arlotech Digital Solutions</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}
