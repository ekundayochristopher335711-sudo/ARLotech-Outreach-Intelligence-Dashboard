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

The generator now defaults to the short 60–100-word option for first-contact outreach and explicitly avoids repeating the same service benefit. Its preferred structure is one verified observation or relevant business detail, one brief service sentence, one attachment sentence when applicable, and one low-pressure question. The generated message remains editable before saving or sending. Operators should verify the recipient, conversation context, offer details, and applicable consent/marketing requirements before sending.

## PDF reports

Website audit reports now use a concise prospect-facing format of up to four pages, starting with an executive summary, a compact score/findings snapshot, and a prioritized reading of the results. The report limits itself to four technical findings and three visual findings, omits diagnostic-only checks and estimated opportunities, and clarifies that coverage describes the inspected scope rather than the whole website. They include a practical three-step improvement plan and a clear Arlotech next step without presenting the report as a quotation or guaranteeing results.

Where saved screenshots are accessible to the signed-in user, the PDF includes up to two visual evidence images alongside its visual score, concise assessment, and evidence-backed findings, separately from the Lighthouse technical results. New reports use the versioned unified score: Visual Design 40%, Performance 18%, SEO 15%, Accessibility 15%, and Best Practices 12%. Missing categories are excluded and the remaining weights are normalized; the report labels these results provisional. The dashboard and PDF share the same score calculation and category breakdown. Historical reports preserve their saved technical-only score methodology. Visual findings are model-generated and should be reviewed by a person. Screenshots cannot verify interactive controls.

## Safety and data behavior

- The database stores visual assessment data under `analysis_details.visual_audit` and a versioned unified score under `analysis_details.unified_score`. Lighthouse category scores and their technical-only score remain separately available.
- Visual assessment findings are presented separately from measured and page-inspection findings.
- Email drafts remain editable and are not automatically sent by generation.
- Screenshot URLs are short-lived and are not stored in the report data. The screenshots are sent to the configured vision provider when visual analysis runs.
