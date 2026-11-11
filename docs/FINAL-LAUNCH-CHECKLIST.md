# ARLOTECH Outreach Intelligence — Final Launch Checklist

Use this checklist before connecting the app to live prospect data or sending real outreach. The application code and Supabase services are deployed separately; a successful frontend build does not deploy database migrations or Edge Functions.

## 1. Protect credentials

- [ ] Keep `.env` out of source control. Only use `.env.example` as a template.
- [ ] Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the frontend environment.
- [ ] Never place the Supabase service-role key, Resend API key, OpenAI key, webhook signing secret, unsubscribe signing secret, or Web Push private key in a `VITE_` variable.
- [ ] If a secret was ever committed, pasted into a public place, or included in a shared ZIP, rotate it before launch.
- [ ] Confirm production and local environments point to the intended Supabase project.

## 2. Apply database migrations

The Phase 3 relationship workspace adds the `prospect_proposals` table. Apply the project's pending migrations to the intended Supabase project:

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npm run supabase:migrate
```

- [ ] Confirm the migration completes without errors.
- [ ] In Supabase, confirm `prospect_proposals` exists and Row Level Security is enabled.
- [ ] Do not manually create a second copy of the table if the migration has already run.
- [ ] Confirm the signed-in user can create and read their own proposal records, and cannot access another user's records.

The existing `tasks`, `prospect_notes`, and `activity_logs` tables are reused by the relationship workspace. No separate migration is required for those features in this release.

## 3. Deploy required Edge Functions

Deploy the functions used by the features you intend to test. At minimum, review the project's README and deploy the current versions of the functions used for website extraction, PageSpeed, visual analysis, email draft generation, sending, inbound replies, and unsubscribe handling.

```sh
npx supabase functions deploy extract-content
npx supabase functions deploy pagespeed-insights
npx supabase functions deploy analyze-website-visuals
npx supabase functions deploy generate-outreach-draft
npx supabase functions deploy send-outreach
npx supabase functions deploy resend-inbound
npx supabase functions deploy unsubscribe
```

- [ ] Configure each required server-side secret using the names documented in the README and the function's source.
- [ ] Configure the Resend sender domain and reply/receiving webhook if email sending and replies are being tested.
- [ ] Configure the OpenAI key server-side if AI draft generation and visual analysis are being tested.
- [ ] Configure Web Push keys only if browser push notifications are being used.
- [ ] Do not deploy an Edge Function until its required secrets and provider settings are ready.

## 4. Build and test the frontend

```sh
npm ci
npm run lint
npm test
npm run build
```

- [ ] Resolve errors before deploying.
- [ ] Review warnings rather than assuming they are harmless.
- [ ] Test the production build locally with `npm run preview`.
- [ ] Confirm the deployed frontend uses the correct production environment variables.

## 5. Run a safe end-to-end test with one sample prospect

Use a test prospect and a website you are authorized to review. Do not begin with a bulk campaign.

- [ ] Create a sample prospect and verify its business name only when confirmed.
- [ ] Run a website audit and inspect the findings against the actual page and screenshots.
- [ ] Generate the PDF and confirm the page count, screenshots, coverage statement, score, and findings are accurate.
- [ ] Generate an email draft and confirm every website-specific claim is supported by the saved audit.
- [ ] Confirm the draft does not say a PDF is attached unless the PDF is actually attached to the send.
- [ ] Save and edit a draft; verify it remains unsent until explicitly sent.
- [ ] Create a follow-up task, change its status, add a relationship note, and confirm the events appear in the prospect timeline.
- [ ] Create a proposal record and change its status; confirm the timeline updates.
- [ ] Verify that a `Do Not Contact` prospect and suppressed email address remain blocked from sending.
- [ ] Send one test email to an address you control, then verify the sent record, reply handling, and unsubscribe flow.
- [ ] Check that no automatic follow-up email is sent: follow-up tasks are reminders for a person to act.

## 6. Before real outreach

- [ ] Review every generated email and attached report yourself.
- [ ] Confirm the recipient, business context, findings, sender identity, reply address, postal/contact details, and attachment.
- [ ] Contact only recipients where you have an appropriate lawful basis and follow applicable email-marketing and privacy requirements.
- [ ] Honor unsubscribes, suppression records, and Do Not Contact flags.
- [ ] Start with a small manually reviewed batch and inspect the results before increasing volume.

## Important behavior notes

- Proposal status tracking is a record-keeping feature; marking a proposal as `Sent` does not send a proposal document.
- Follow-up tasks are reminders; they do not automatically send emails.
- Email-open tracking, when enabled, is approximate and must not be treated as proof that a person read an email.
- A successful audit of one page does not mean every page on a multi-page website was reviewed. Check the coverage and limitations shown in each report.
