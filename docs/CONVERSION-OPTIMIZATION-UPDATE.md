# Arlotech Outreach Intelligence — Conversion Optimization Update

## What this update changes

This is an additive product update. The existing Standard and BLACKSITE experiences, route structure, authentication flow, Supabase data model, and outreach sending safeguards are retained.

### 1. Brand consistency
- Replaced the previous teal/green geometric mark in the Standard and BLACKSITE wordmarks with the supplied Arlotech yellow-and-navy emblem.
- Updated the shared favicon artwork to use the supplied mark.
- Kept the wordmark treatment legible in both light and dark workspace headers.

### 2. Conversion visibility on the dashboard
The dashboard now derives pipeline indicators from existing user-scoped records:
- Interested prospects (`Interested` status)
- Meetings booked (`Meeting Booked` status)
- Customers won (`Won` status)
- Follow-ups due (active follow-up records whose `next_action_at` is due)

The Standard dashboard adds a conversion snapshot with direct actions to review replies and clear follow-ups. BLACKSITE receives the same pipeline counts in its existing command-deck visual language.

The reply-rate figure is calculated as inbound replies divided by successfully sent outbound email records. It is a **reply rate**, not a sales conversion rate. A true sales conversion rate requires reliable attribution between a prospect, an outreach touch, and a recorded won outcome; this update does not fabricate that attribution.

## Conversion operating playbook

1. **Prioritize warm intent.** Review inbound replies before sending more cold outreach. Update each prospect's status as soon as the conversation changes.
2. **Clear due follow-ups.** Work the due queue daily. Personalize each follow-up to the last interaction; do not send an automatic sequence merely because a reminder is due.
3. **Lead with one verified observation.** In audit-based outreach, use one high-confidence finding and explain its practical business impact. Do not present an estimate as a confirmed defect.
4. **Offer one low-friction next step.** Ask for a short conversation or permission to share a preview. Avoid stacking multiple competing calls to action.
5. **Make the value concrete.** Connect the proposed website change to a visitor action such as calling, requesting a quote, booking, or purchasing. Avoid promising rankings, revenue, or guaranteed results.
6. **Keep the send safeguards.** Respect do-not-contact flags, suppressions, verified sender configuration, postal-address/opt-out requirements, and the server-side send limits. Review messages before sending.
7. **Record outcomes.** Use the prospect statuses consistently. `Interested`, `Meeting Booked`, and `Won` now feed the dashboard snapshot.

## Important measurement definitions

- **Reply rate:** inbound replies / successfully sent outbound messages. Multiple replies from the same prospect can make this exceed a unique-prospect response rate; interpret it as a message-level indicator.
- **Interested / Meetings / Won:** current prospect records grouped by their exact status values. These are pipeline counts, not cohort conversion percentages.
- **Follow-ups due:** active follow-up records whose scheduled action time is at or before the current time.

For a defensible end-to-end conversion rate, a future analytics iteration should add immutable campaign-touch attribution, unique prospect-level reply detection, outcome timestamps, and cohort windows. That requires a reviewed schema migration and should not be guessed into the current database.

## Deployment and verification

No database migration is introduced by this update. The dashboard uses existing `prospects`, `email_messages`, and `follow_up_sequences` tables. No Supabase secrets or environment values are included in this ZIP.

After extracting:

```bash
npm ci --legacy-peer-deps
npm run build
npm test
npm run lint
```

Configure the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` values already used by the project. Do not put a Supabase service-role key or Resend API key in frontend environment variables.

## Scope and known limits

- This update does not change the visual layout or navigation architecture; it adds a compact conversion snapshot and replaces brand artwork.
- It does not promise a particular uplift. Conversion depends on lead quality, offer fit, deliverability, message relevance, follow-through, and sales handling.
- A successful send is not proof of inbox placement.
- The build/test suite could not be executed in the authoring environment because dependency installation did not complete before timeout. Source-level review and ZIP integrity checks are not substitutes for a successful local production build and test run.
