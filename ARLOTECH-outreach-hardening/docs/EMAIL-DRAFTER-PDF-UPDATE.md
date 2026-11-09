# Email Drafter & PDF Report Update

## Email drafter

The message-type selector now covers:

- General website review
- Technical improvement
- Website redesign
- Business growth
- Personal consultancy
- Cold introduction
- Business without a website
- SEO and performance improvement
- Reply to an interested prospect
- Response to a pricing question
- Discovery-call request

The optional context field lets the operator add confirmed offer details, a real price, scope, reply context, or meeting information. The generator does not invent prices, delivery dates, availability, or guaranteed business outcomes. Website-specific claims continue to rely on saved audit evidence. The no-website message uses cautious wording because an incomplete prospect record does not prove that a business has no website.

The generated message remains editable before saving or sending. Operators should verify the recipient, conversation context, offer details, and applicable consent/marketing requirements before sending.

## PDF reports

Website audit reports now start with an executive summary, a compact score/findings snapshot, and a prioritized reading of the results. They include a practical three-step improvement plan and a clear Arlotech next step without presenting the report as a quotation or guaranteeing results.

Where saved visual-review screenshots are available, the download flow and website-report email attachment retrieve short-lived signed URLs, convert the images to JPEG, and embed them in the PDF. If a screenshot cannot be retrieved, the report still generates and retains the text observations.

## Safety and data behavior

- No database schema or migration was changed.
- Existing report findings remain separated into measured, page-inspection, tool-assisted, and unverified categories.
- Email drafts remain editable and are not automatically sent by generation.
- Screenshot URLs are short-lived and are not stored in the report data.
