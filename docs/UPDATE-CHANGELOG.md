# Update changelog

## Email Drafter + PDF Conversion Update

- Shortened the default AI outreach draft length and added explicit anti-repetition guidance for first-contact emails.
- Reduced prospect-facing website review PDFs to a four-page maximum, prioritizing up to four technical findings and three visual findings while omitting diagnostic-only checks and estimated opportunities.
- Clarified audit scope so a percentage does not imply that the entire website was reviewed; added up to two signed, user-scoped screenshot images where retrieval succeeds.
- Corrected customer-facing explanations for image aspect ratio, heading order, doctype, list markup, and First Contentful Paint thresholds across both PDF and email copy; AI email generation now normalizes these known checks before drafting.

- Expanded the email message-type library with cold introductions, no-website pitches, SEO/performance outreach, interested-prospect replies, pricing replies, and discovery-call requests.
- Added operator-supplied context for confirmed pricing, offer scope, conversation details, and meeting information.
- Added in-product descriptions explaining when each message type should be used.
- Kept the email body editable and retained evidence-aware wording and safeguards against invented findings or guaranteed outcomes.
- Added an executive summary and practical improvement plan to website audit PDFs.
- Added a commercial next step inviting the reader to discuss implementation and request a project-specific quote.
- Embedded saved website screenshots in downloaded reports and report attachments when signed screenshot retrieval succeeds.
- No database schema or migration changes.

## Growth Center update

- Added a Growth Center route and sidebar entry without replacing existing dashboard navigation.
- Added explainable prospect-priority scoring using saved prospect and completed audit data; excluded do-not-contact, negative, won and lost records from the active queue.
- Added pipeline-stage counts and live sent/reply/failure/follow-up counts from existing Supabase records.
- Added an operational deliverability checklist that clearly distinguishes local message records from authoritative DNS and sender-reputation verification.
- Added a client-side proposal PDF builder using operator-confirmed scope, price and timeline; no automatic sending or fabricated commercial terms.
- Added a detailed Copilot implementation brief covering the full recommended roadmap, current project architecture, safety constraints, validation steps and definition of done.
- No database schema or migration changes.

## Growth intelligence completion pass

- Added `src/lib/growthIntelligence.ts` with explainable opportunity scoring, reply-aware next-action recommendations, and a pre-send email quality checklist.
- Added unit tests for suppression, prospect priority, reply intent and email safety checks.
- Integrated the quality checklist into the manual draft editor; it is advisory and does not replace the existing server-side send safeguards.
- Growth Center now ranks eligible prospects using the latest completed audit record available, displays contributing factors, calculates linked-prospect reply conversion, and surfaces review-before-send follow-up recommendations from linked message history.
- Expanded the proposal PDF form with milestones, payment terms, exclusions, assumptions and validity; added multi-page continuation and page numbering.
- Deliverability DNS and reputation indicators intentionally remain Unknown until verified by a trusted server-side DNS checker or provider webhook. Existing message records are not misrepresented as confirmed inbox delivery.
- No database migration, deployment, email send or live data mutation was performed.

## Phase 2 — Dashboard, audit history, and prospect engagement

- Added a dashboard website-intelligence snapshot showing completed audit count, average score across scored records in the latest 100 completed audits, and the most recent completed audit date.
- Expanded each prospect's website analysis history with a latest-score comparison against the previous completed scored audit. The comparison is informational and does not rewrite historical scores or scoring methodology.
- Added a prospect engagement timeline that combines saved activity-log events and outbound/inbound email message records, ordered chronologically. It displays only events with a recorded timestamp and does not infer opens, delivery, or engagement that the database has not recorded.
- Added the visual-design category to the per-audit score breakdown where the stored category score is available.
- No database migration was required; the additions use existing user-scoped Supabase tables and existing row-level security.
