# Arlotech Outreach Intelligence Dashboard

A web app for organizing an outreach pipeline: review prospect metrics, keep prospect records, group work into campaigns, and track outreach activity. The current app is a React/Vite frontend backed by Supabase Auth and Postgres.

## Run locally

Requirements: Node.js 20.19+ or 22.12+ and npm.

1. Install packages:

   ```sh
   npm ci --legacy-peer-deps
   ```

2. Link the Supabase CLI to the project. The configured project reference is in `supabase/config.toml`; replace it if you are using a different project:

   ```sh
   npx supabase login
   npx supabase link --project-ref vfgaqyatzyrsdjdsejie
   npx supabase migration list --linked
   npm run supabase:migrate
   ```

   Review the linked project and migration list before applying migrations. Do not apply only the first migration in the SQL Editor; this app requires the full ordered migration set.

3. Copy `.env.example` to `.env` and enter the project URL and public anon/publishable key from Supabase **Project Settings → API** on separate lines. Do not use or expose the `service_role` key in this browser app.

   ```env
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-public-anon-or-publishable-key
   ```

4. Create a user in Supabase **Authentication → Users**. The app currently supports sign-in only; it does not have a sign-up flow or a seeded demo user.
5. Start the app:

   ```sh
   npm run dev
   ```

The shareable archive does not include `node_modules`. Run the install command above from the project directory after extracting it.

The migrations enable row-level security and scope records to their owning Supabase user. After pulling schema changes, apply pending migrations before deploying frontend code:

```sh
npm run supabase:migrate
```

## Deploy

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel for each environment you use, then deploy/redeploy so Vite embeds the values in the client build. Keep the anon/publishable key public and rely on the database's row-level security; never add a service-role key to a `VITE_` variable.

## Current scope

The dashboard reads Supabase metrics and activity. The prospect list supports search, manual creation, and CSV import. CSV files must include a `business_name` header; supported optional headers are `contact_name`, `email`, `website`, `business_category`, `city`, `country`, `phone`, `linkedin_url`, `notes`, `source`, `status`, and `do_not_contact`.

Campaigns can be created, filtered, updated, and deleted. Email drafts can be created, edited, associated with prospects or campaigns, and deleted. The Email Drafts page supports sending a reviewed generated draft to its selected prospect, manually composed one-off emails to a typed recipient, and manually selected, reviewed prospect batches. All send through the authenticated Resend function and are recorded in email history. Replies and analytics use the email activity records stored in Supabase. Follow-up reminders can be scheduled and their statuses managed, but reminders do not trigger automatic email. Account profile details can be updated in Settings.

Outreach batches are sent individually through the `send-outreach` Supabase Edge Function and Resend. The function checks ownership, do-not-contact status, suppressions, and completed website audits; it limits batches to 10 and sends to 50 recipients per rolling 24 hours. Previously contacted prospects are labeled and require confirmation before resending. Website reports are attached for audited prospects, while prospects without a website receive a separate introduction. Review and confirm every message before sending. Email sending does not guarantee inbox placement or replace applicable marketing/privacy compliance.

AI website analysis and outreach generation require their respective server-side secrets. Replies sent to your configured Resend receiving domain are recorded by the `resend-inbound` Edge Function. Automatic follow-up sending is not implemented.


## Website Intelligence integrations

The Website Intelligence page orchestrates three Supabase Edge Functions:

- `pagespeed-insights` — calls the Google PageSpeed Insights API (Lighthouse) for performance, accessibility, SEO and best-practices scores plus audit details.
- `extract-content` — fetches the target page server-side and extracts title, meta, headings, text, links, images, schema.org, etc. For client-rendered pages, contact extraction also checks a small number of bounded same-origin JavaScript bundles for embedded email and telephone links.
- `gemini-analysis` — sends the extracted content + PageSpeed data to the Gemini API and returns an AI summary, score explanation, recommendations and observations.

The combined report is stored in the `website_analyses` Supabase table.

Customer-facing PDFs use the official Arlotech Digital Solutions logo; the same supplied favicon is used throughout the app and browser tabs. Website audit PDFs are limited to three pages: an executive summary with the health score and up to three distinct customer friction points, plain-English explanations of those same issues, and a business-impact close with a direct Arlotech call to action. Repeated findings and duplicate explanations are omitted. Reports also omit raw file paths, developer-only terms, do-it-yourself instructions, and estimated savings that could be mistaken for guaranteed results. Verified prospect names are used only when explicitly confirmed.

The displayed ArloTech composite score is the rounded arithmetic mean of available Lighthouse category scores; it is not an official Lighthouse score. Prospect business names default to unverified and appear as the report recipient only after an account user verifies them in the prospect record.

Website Intelligence can also run an optional visual review. It uses PageSpeed's rendered screenshots for the homepage (desktop and mobile where available) and up to three same-origin pages discovered first inside navigation landmarks, then from other page links if no navigation links are available (mobile). If the initial HTML contains no page links, JavaScript-rendered navigation may require a browser-based crawler and will not be discovered by this bounded pass. Screenshots are saved in a private, user-scoped Supabase Storage bucket, and Gemini returns AI-assisted visual observations for human review. A PageSpeed timeout can leave an individual viewport screenshot unavailable while preserving other audit results. This is a bounded initial-load crawl; it does not click menus, submit forms, test interactive states, or guarantee that visual observations are correct. It makes additional PageSpeed requests. The **Re-analyze all websites** action refreshes the primary-page technical and content analysis without running this optional multi-page visual review; use an individual website analysis when detailed visual screenshots are needed. Bulk analysis progress survives refresh, can be paused between groups of three sites and resumed later, and can be closed from the completed progress panel.

Before deploying the visual review, apply the pending migrations and redeploy the updated `extract-content` and `gemini-analysis` functions. Migration `20261027220000_create_visual_audit_screenshots.sql` creates the private screenshot bucket.

### Configure secrets (server-side, never exposed to the browser)

```sh
npx supabase secrets set PAGESPEED_API_KEY=your-google-pagespeed-key
npx supabase secrets set GEMINI_API_KEY=your-gemini-key
```

### Deploy the functions

```sh
npx supabase functions deploy pagespeed-insights
npx supabase functions deploy extract-content
npx supabase functions deploy gemini-analysis
```

The frontend invokes them via `supabase.functions.invoke(...)` and stores the resulting report in Supabase.

### Prospect extraction and AI outreach drafting

Pasting business listings into the prospect importer and generating AI-assisted outreach drafts use the `extract-leads` and `gemini-outreach` Edge Functions. Configure the Gemini key as a server-side secret, then deploy both functions:

```sh
npx supabase secrets set GEMINI_API_KEY=your-gemini-key
npx supabase functions deploy extract-leads
npx supabase functions deploy gemini-outreach
```

The Gemini key is also used by `gemini-analysis`; set it once for the linked project. Never put it in a `VITE_` variable or browser code.

## Resend outreach

Verify a sender domain in Resend, then configure these secrets for the linked Supabase project. Use a valid sender address from the verified domain and your business's postal address. Never put the Resend API key in `.env`, a `VITE_` variable, source control, or browser code.

```sh
npx supabase secrets set RESEND_API_KEY=re_your_key RESEND_FROM_EMAIL="ArloTech <outreach@yourdomain.com>" OUTREACH_POSTAL_ADDRESS="Your business postal address"
npx supabase functions deploy send-outreach
```

Apply the email recipient tracking migration before deploying the updated function:

```sh
npm run supabase:migrate
npx supabase functions deploy send-outreach
```

### Receive email replies

Configure Resend Receiving for a domain/address that can receive replies. In Resend, set the `email.received` webhook destination to:

```text
https://your-project-ref.supabase.co/functions/v1/resend-inbound
```

Set the signing secret shown in that webhook's details as a Supabase Edge Function secret, then apply the migration and deploy the receiver:

```sh
npx supabase secrets set RESEND_WEBHOOK_SECRET="whsec_your_webhook_signing_secret"
npx supabase db push --linked
npx supabase functions deploy resend-inbound
```

The receiver verifies Resend's signature, retrieves the message body from Resend, and links it to the most recent sent message from the same sender address. Replies without a matching recorded outbound recipient are acknowledged but not stored. Refresh the Replies page to load newly received messages. Keep the signing secret server-side; never add it to Vite environment variables or frontend code.

In **Email Drafts**, generate a draft for a prospect and send it after review and lawful-basis confirmation, write a one-off message to any recipient address, or select up to 10 eligible prospects, preview and edit each individual email, confirm you have a lawful basis to contact the recipients, then send. The configured postal address and an opt-out instruction are appended automatically. Each website prospect must have a completed audit; its PDF report is attached. Prospects without a website receive an introduction without an audit attachment. Previously contacted recipients are clearly labeled and require an explicit confirmation before resending. Suppressed addresses and prospects marked Do Not Contact remain blocked. The server caps sending at 50 messages per rolling 24 hours.


```sh
npm run build
npm run lint
npm test
```

## Conversion optimization update

See [`docs/CONVERSION-OPTIMIZATION-UPDATE.md`](docs/CONVERSION-OPTIMIZATION-UPDATE.md) for the dashboard conversion snapshot, measurement definitions, outreach operating playbook, and deployment notes. The update is additive and introduces no database migration.

## Growth Center and next-step implementation

The additive Growth Center is available at `/growth-center`. See `docs/GROWTH-CENTER-UPDATE.md` for what is implemented and what remains provider/schema dependent. For GitHub Copilot, use the project-specific implementation brief in `docs/COPILOT-IMPLEMENTATION-BRIEF.md`; it instructs Copilot to inspect this exact codebase and preserve its existing architecture, UI, data and security boundaries.
