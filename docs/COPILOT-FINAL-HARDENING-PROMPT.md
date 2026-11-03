# Arlotech final hardening — Copilot instructions

You are continuing the exact Arlotech Outreach Intelligence project in this archive. The repository is the source of truth. Do not scaffold a new app or redesign the existing interface.

## Read first

1. `README.md`
2. `docs/COPILOT-IMPLEMENTATION-BRIEF.md`
3. `docs/UPDATE-CHANGELOG.md`
4. `src/lib/growthIntelligence.ts` and its tests
5. `src/pages/GrowthCenter.tsx`
6. `src/pages/EmailDrafts.tsx`
7. `src/lib/emailDraftGenerator.ts`, `src/lib/outreachEmail.ts`, `src/lib/exportPdf.ts`
8. Supabase migrations, `src/types/database.ts`, existing Edge Functions and the actual Resend send path.

## Already added in this archive

- Explainable opportunity scoring using saved CRM and completed audit data, with suppression of do-not-contact and terminal prospects.
- Message quality checklist in the manual draft editor.
- Follow-up recommendations based on linked inbound/outbound history and current prospect status. Recommendations are not automatically sent.
- Linked-prospect reply conversion counts with an explicit denominator.
- Expanded proposal PDF fields: scope, milestones, payment terms, exclusions, assumptions and validity, plus multi-page pagination and page numbers.
- Unit tests for the growth-intelligence helpers.
- Deliverability indicators are explicitly unknown until verified; the UI does not claim that a message accepted by a provider reached the inbox.

## Finish the production-grade integrations

### 1. Provider events and deliverability

Inspect the existing Resend integration and webhook/Edge Function patterns. If there is no secure webhook endpoint, implement one using the existing Supabase Edge Functions conventions. Verify provider webhook signatures using server-side secrets only. Persist idempotently by provider event ID. Handle accepted, delivered, bounced, complained, unsubscribed and failed events only where Resend actually supplies them. Do not infer delivery from API acceptance. Never store secrets in frontend code. Add tests for signature rejection, duplicate/replayed events, invalid payloads and event-to-message association.

### 2. DNS verification

Do not try to perform authoritative DNS verification in the browser. Add a server-side DNS verification endpoint only if it can be implemented securely with the deployed runtime. Verify the actual sender domain and expected SPF/DKIM/DMARC records, return record evidence and timestamp, and show Unknown when unavailable. Never label sender reputation healthy unless a trusted source provides it.

### 3. Campaign safety

Build configurable thresholds from real provider bounce/complaint events and recent sending volume. Show a pause recommendation and require explicit operator confirmation to pause. Never auto-resume. Enforce suppression (do-not-contact, unsubscribe, complaint and hard bounce) at the server send boundary, not just in React. Add idempotency to prevent duplicate send retries. Keep manual approval before every send unless an existing, explicitly enabled campaign mode says otherwise.

### 4. Follow-up intelligence

Use prospect-linked inbound/outbound messages, follow-up sequence records and CRM status. Parse reply intent conservatively and present the evidence/reason. A positive reply, pricing question or request for information should recommend a human response, not an automatic send. Stop on opt-out, complaint, hard bounce, Not Interested, Won, Lost or Do Not Contact. Review actual existing sequence scheduler behavior before changing it. Add duplicate prevention and tests.

### 5. Analytics

Use linked prospect/message/campaign records and clear denominators. Separate provider-accepted from delivered, replied, meeting booked, proposal sent and won. Do not infer revenue unless an explicit confirmed deal value exists. Add time range and campaign/industry breakdowns only where source records support them. Show sample sizes and empty states.

### 6. Proposals

Review whether a proposal table and RLS policies already exist. If not, do not invent a live schema silently. Propose a backward-compatible migration with ownership RLS and ask for approval before applying. Persist proposal drafts, versions, status, accepted/rejected dates and explicit deal value only after approved schema work. Keep all commercial terms user-entered. Add a preview and validate required fields before export.

### 7. Email and PDF

Test every message intent and follow-up stage. Validate evidence, recipient, suppression, duplicate/recent contact, attachment claim and tone. Ensure the exact PDF preview for a prospect/analysis is the same PDF attached to that prospect's message. Test screenshots only when a real asset is available. Check PDF pagination, long names, URLs and multi-page content.

## Engineering rules

- Preserve routes, auth, data, themes and existing layout.
- No destructive migrations, data resets, live deployment or outbound emails.
- No paid dependency without explicit approval.
- Do not fabricate metrics or provider status.
- Run `npm ci`, `npm run build`, `npm run lint`, and `npm test`.
- Fix regressions and add tests. Report exact results and any work blocked by credentials, provider setup or approved migrations.
- Do not mark any integration complete merely because a UI card exists.
