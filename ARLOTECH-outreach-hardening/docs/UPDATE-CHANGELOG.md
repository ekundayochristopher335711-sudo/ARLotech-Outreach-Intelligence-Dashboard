# Update changelog

## Email Drafter + PDF Conversion Update

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

## Provider-event and send-safety hardening

- Extended the existing signed Resend inbound Edge Function to handle outbound provider events too, using the existing webhook URL and secret with event-ID idempotency, timestamp replay protection, provider-to-message association, and event-type validation.
- Added an additive migration for owner-scoped provider events and global Resend suppression records. It has been applied to the isolated local development database for verification; it has not been applied to a remote project.
- The send boundary now checks provider suppressions, CRM terminal states, duplicate recipients, recent resend confirmation and rolling send volume independently of mutable provider status.
- Reviewed batches can be attributed to an Active campaign; server-side ownership/status checks block paused campaigns and provider events now have real campaign attribution where selected.
- Growth Center and Analytics distinguish successful send requests from Resend acceptance, delivery, bounce, complaint, failure and suppression events. DNS and sender reputation remain Unknown.
- Campaign pause recommendations use a minimum sample and unique linked message IDs; pausing always requires explicit operator confirmation and never auto-resumes.
- Follow-up recommendations stop on CRM terminal states, negative/opt-out replies, and provider bounce, complaint, suppression or failure events.
- Proposal PDFs now require validated operator-entered terms, a current preview and explicit confirmation; proposal data remains client-side and is not persisted.
- Added unit tests for webhook signatures/payloads, suppression decisions, pause thresholds, proposal validation and existing Growth Center logic.
