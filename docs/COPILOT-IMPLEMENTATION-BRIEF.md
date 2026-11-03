# Arlotech Outreach Intelligence — Copilot implementation brief

This brief belongs to the exact ZIP it accompanies. Treat the checked-out project in this archive as the source of truth. Do not scaffold a replacement app, redesign the dashboard, or assume a schema that is not present.

## What is already present in this ZIP

- React 19 + TypeScript + Vite + Tailwind, React Router, TanStack Query, Supabase JS, jsPDF, Vitest and Oxlint.
- Existing authenticated app shell and standard / BLACKSITE themes.
- Prospect CRM, campaigns, website intelligence, email drafting, replies, follow-ups, analytics, settings and PDF audit export.
- Additive `Growth Center` at `/growth-center` with a rule-based prospect priority score, a live pipeline snapshot, operational deliverability checklist/record counts, and a client-side proposal PDF builder.
- The proposal builder intentionally asks the operator to enter a confirmed price and timeline; it does not invent commercial terms.
- No schema migration was added by this update.

## Required workflow before changing anything

1. Read `README.md`, `docs/UPDATE-CHANGELOG.md`, `docs/EMAIL-DRAFTER-PDF-UPDATE.md`, `docs/CONVERSION-OPTIMIZATION-UPDATE.md`, `package.json`, `src/types/index.ts`, `src/types/database.ts`, all current migrations, and the relevant existing page/lib/test files.
2. Inspect the exact current Supabase schema and existing RLS policies from migrations and generated types. Do not infer table/column names from this brief.
3. Run `npm ci`, `npm run build`, `npm run lint`, and `npm test`. Record baseline failures separately from regressions introduced by your changes.
4. Make small additive changes within the existing architecture and UI language. Preserve current routes, navigation, login/auth, standard theme and BLACKSITE theme. Do not replace the UI.
5. Do not apply migrations, modify live data, send emails, or deploy. Create migrations only when absolutely required, explain why, and make them backward-compatible with explicit RLS policies and indexes.

## Product outcomes to complete

### A. Smart prospect scoring

- Evolve `src/pages/GrowthCenter.tsx` scoring into a transparent, explainable scoring service with unit tests.
- Use only verified CRM fields and the latest completed website analysis per prospect. Never score `do_not_contact`, opted-out, Not Interested, Won or Lost prospects as outreach targets.
- Distinguish opportunity score from likelihood-to-buy. Never label a heuristic as an AI prediction.
- Show score factors and missing data. Add configurable weights only if they can be stored safely without breaking existing users.

### B. Email drafter quality and context

- Inspect `src/lib/emailDraftGenerator.ts`, `src/pages/EmailDrafts.tsx`, their tests, and the actual email sending path.
- Ensure all supported intents work: cold introduction, no-website offer, website redesign, technical audit, SEO/performance, business growth, personal consultancy, interested reply, pricing response, discovery call, and staged follow-ups.
- Use verified prospect and audit evidence only. Keep estimated opportunities clearly labelled. Never fabricate audit findings, pricing, guarantees, timelines, previous interactions, attachments, or business outcomes.
- Add a pre-send quality check for specificity, naturalness, clarity, credibility, CTA, length, unsupported claims, missing recipient, do-not-contact suppression, and duplicate/recent outreach.
- Make follow-up copy aware of conversation state and suppress automation for positive replies, opt-outs, hard bounces, complaints, Not Interested, Won and Do Not Contact.
- Keep the existing deterministic fallback. If introducing an LLM, it must be an optional server-side integration with explicit configuration, strict evidence payload, output validation, rate limits and a graceful fallback. Never put API keys in browser code.

### C. Consultancy-grade PDF reporting

- Inspect existing `src/lib/exportPdf.ts`, website analysis contracts and tests before editing.
- Preserve evidence provenance: measured Lighthouse findings, page inspection observations, tool-assisted suggestions and unverified ideas must remain distinct.
- Include executive summary, score breakdown, prioritized issues, business impact stated cautiously, recommended implementation plan, visual evidence where the source screenshot is actually available, methodology/limitations, and Arlotech contact/next-step section.
- Embed screenshots only when a real accessible image asset exists; otherwise omit the image and disclose the limitation. Do not print fake screenshot placeholders as evidence.
- Ensure pagination, no clipped text, readable font sizes, page numbers, branded headers/footers, and safe handling of long business names and URLs.
- Ensure email attachment bytes correspond to the exact report previewed for that prospect and analysis record. Store/reuse a stable report reference or regenerate from the same immutable snapshot; do not attach a different prospect's report.

### D. Deliverability center — honest, evidence-based

- Build checks around actual sending-provider events and DNS verification. A browser-only app cannot authoritatively verify DNS or mailbox reputation; use a trusted server-side DNS check/edge function only if the project already has a secure pattern or add a reviewed server-side implementation.
- Track provider acceptance, delivery, bounce, complaint, unsubscribe and failure events only when the provider/webhook actually supplies them. Do not treat a successful API request as confirmed inbox delivery.
- Show SPF, DKIM and DMARC as Unknown until verified. If verified, retain timestamp, source and domain. Never claim sender reputation is healthy without a reliable source.
- Add configurable safety thresholds and a campaign pause recommendation/guard. Never auto-resume a paused campaign without user action. Suppress opt-outs and do-not-contact records at the server boundary as well as the UI.
- Add tests for missing webhooks, duplicate events, event replay, bad signatures, and threshold behavior.

### E. Follow-up intelligence

- Reuse the existing follow-up sequence model and reply ingestion path. Do not invent opens/clicks; tracking may be unavailable or privacy-limited.
- Recommend the next action from actual message/reply/status history. Stop or pause on opt-out, negative response, bounce, complaint, meeting booked or won status.
- Make all generated follow-ups review-before-send by default. Ensure idempotency so retries do not send duplicate messages.

### F. Conversion analytics

- Build funnel counts and conversion rates from valid linked prospect/message/campaign records, with explicit time windows and denominators.
- Distinguish sent, provider-accepted, delivered, replied, interested, meeting booked, proposal sent and won only where the underlying data supports those states. Do not infer delivery from sent status.
- Add revenue analytics only when an explicit confirmed deal value exists; do not invent a revenue column or estimate revenue from prospect count.
- Include campaign and industry breakdowns, with empty states and clear sample sizes.

### G. Proposal/quotation workflow

- Improve the existing Growth Center proposal PDF builder. Add configurable business details, currency, scope, deliverables, exclusions, milestones, payment terms, validity date, assumptions and acceptance block.
- All commercial terms must be user-entered/confirmed. Never infer a price, tax, deadline, guarantee or legal clause.
- Add preview and validation before export. Save proposals only if a compatible table and RLS policy already exist or a reviewed migration is explicitly approved.

## Non-negotiable engineering and safety constraints

- No destructive SQL, table drops, broad policy removal, or unreviewed migration execution.
- No secrets, service-role keys, SMTP credentials or provider tokens in frontend files, logs, ZIP docs or examples.
- Keep Supabase access user-scoped and verify RLS. Server-side actions must validate auth, ownership, recipient consent/suppression and payloads.
- Preserve existing records and behavior. Do not rename routes, tables, columns, environment variables or public function contracts without a compatibility layer.
- Avoid new paid services unless the user explicitly approves them. Prefer existing Supabase/Resend infrastructure.
- Do not claim a feature is complete unless its tests and real integration path prove it.
- Update relevant unit/integration tests and docs. Provide a concise change summary, changed-file list, migration status (not applied), test/build results and known limitations.

## Definition of done

The current project still builds, existing tests remain green, new features are tested, standard and BLACKSITE themes remain usable, no current records are lost, no email is sent without explicit user action, and all metrics/claims are traceable to actual saved data.
