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

The dashboard reads Supabase metrics and activity. The prospect list supports search, manual creation, CSV import, and extracting businesses with website links from pasted Google Maps listings. CSV files must include a `business_name` header; supported optional headers are `contact_name`, `email`, `website`, `business_category`, `city`, `country`, `phone`, `linkedin_url`, `notes`, `source`, `status`, and `do_not_contact`.

Campaigns can be created, filtered, updated, and deleted. Email drafts can be created, edited, associated with prospects or campaigns, and deleted. The Email Drafts page has two sending workflows: manually compose a one-off email, or build locally generated personalized drafts for one or more selected prospects, review/edit them, then send. Generated messages are saved as drafts before sending. All sends use the authenticated Resend function and are recorded in email history. Replies and analytics use the email activity records stored in Supabase. Follow-up reminders can be scheduled and their statuses managed, but reminders do not trigger automatic email. Account profile details can be updated in Settings.

Outreach batches are sent individually through the `send-outreach` Supabase Edge Function and Resend. The function checks ownership, do-not-contact status, suppressions, and completed website audits; it accepts up to 10 emails per request and sends to 50 recipients per rolling 24 hours. The dashboard can select up to 50 prospects and processes sends in sequential requests of at most 10, retaining sent results so a failed remainder can be retried without resending successful recipients. Previously contacted prospects are labeled and require confirmation before resending. Draft generation requires a website link but does not require an email address, category, or completed audit; sending still requires a valid recipient and a matching audit with an evidence-backed finding. Review and confirm every message before sending. Email sending does not guarantee inbox placement or replace applicable marketing/privacy compliance.

Replies sent to your configured Resend receiving domain are recorded by the `resend-inbound` Edge Function. Automatic follow-up sending is not implemented.


## Website Intelligence integrations

The Website Intelligence page orchestrates three Supabase Edge Functions:

- `pagespeed-insights` — calls the Google PageSpeed Insights API (Lighthouse) for performance, accessibility, SEO and best-practices scores plus audit details.
- `extract-content` — fetches the target page server-side and extracts title, meta, headings, text, links, images, schema.org, etc. For client-rendered pages, contact extraction also checks a small number of bounded same-origin JavaScript bundles for embedded email and telephone links.
- `analyze-website-visuals` — after screenshots are saved, sends their image data to the OpenAI Responses API for a separate, evidence-based visual assessment. It requires the server-side `OPENAI_API_KEY`; `OPENAI_VISION_MODEL` is optional and defaults to `gpt-4.1-mini`. Screenshots are not sent if no stored images are available.

The PageSpeed scores, extracted page details, and measured findings are stored in the `website_analyses` Supabase table. The Lighthouse technical score remains distinct from the versioned unified score, which incorporates the visual score when available.

After a successful analysis linked to a prospect, valid website-extracted email and phone values replace saved values. If the website yields no email or phone, the saved value is retained. The current extractor does not infer a person's name.

Customer-facing PDFs use the official Arlotech Digital Solutions logo without an added frame. Website audit reports adapt to the confirmed findings, use one to three readable pages, and include a clear health overview, customer-focused explanations of the priority issues, and a low-pressure contact invitation. They avoid repeating findings, raw file paths, developer-only wording, do-it-yourself instructions, and estimated savings that could be mistaken for guaranteed results. Verified prospect names are used only when explicitly confirmed.

New audits use a versioned unified score: Visual Design 40%, Performance 18%, SEO 15%, Accessibility 15%, and Best Practices 12%. The displayed score is rounded to a whole number and is not an official Lighthouse score. If a category is unavailable, the dashboard labels the result provisional and normalizes the weights of the available categories rather than treating missing data as zero or perfect. The PDF uses the same calculation and breakdown. Historical audits retain their saved score and original technical-only methodology. Prospect business names default to unverified and appear as the report recipient only after an account user verifies them in the prospect record.

Website Intelligence can also save PageSpeed screenshots from the homepage (desktop and mobile where available) and up to three same-origin pages. If the initial HTML contains no page links, JavaScript-rendered navigation may require a browser-based crawler and will not be discovered by this bounded pass. Screenshots are saved in a private, user-scoped Supabase Storage bucket and sent to the configured OpenAI vision model for a separate visual assessment. Do not use this feature on screenshots containing information you do not want sent to OpenAI. Visual findings are model-generated suggestions that should be checked by a person; static screenshots cannot verify menus, forms, or other interactive states. Missing configuration or a failed visual assessment does not discard the technical audit or screenshots; the unified score is then provisional if the visual category is unavailable. This review makes additional PageSpeed requests. The **Re-analyze all websites** action refreshes the primary-page technical and content analysis without running the multi-page screenshot review. Bulk analysis progress survives refresh, can be paused between groups of three sites and resumed later, and can be closed from the completed progress panel.

Before deploying screenshot review, apply the pending migrations and deploy the `extract-content` function. Migration `20261027220000_create_visual_audit_screenshots.sql` creates the private screenshot bucket.

### Configure secrets (server-side, never exposed to the browser)

```sh
npx supabase secrets set PAGESPEED_API_KEY=your-google-pagespeed-key
npx supabase secrets set OPENAI_API_KEY=your-server-side-openai-api-key
npx supabase secrets set OPENAI_VISION_MODEL=gpt-4.1-mini
```

The PageSpeed key is only used server-side and must never be placed in a `VITE_` variable or browser code.

### Deploy the functions

```sh
npx supabase functions deploy pagespeed-insights
npx supabase functions deploy extract-content
npx supabase functions deploy analyze-website-visuals
```


## Resend outreach

Verify a sender domain in Resend, then configure these secrets for the linked Supabase project. Use a valid sender address from the verified domain, a reply address configured for Resend Receiving, and your business's postal address. Never put the Resend API key in `.env`, a `VITE_` variable, source control, or browser code.

### AI-generated generic email drafts

The Email Drafts page can generate generic AI-assisted drafts that do not use recipient names, business details, websites, audits, notes, or communication history. Each draft briefly explains Arlotech's website design, development, or improvement services, describes a realistic general benefit, and invites feedback about the recipient's website goals. When a matching audit PDF is available, the draft says it is attached; if PDF creation fails, that statement is removed before sending. Generated copy uses a collective sender voice ("we") and is checked to prevent first-person singular wording and internal audit labels such as `visual-1` from appearing. The sender identity and signature come from the configured profile. Choose one of six general approaches: professional, friendly, website services, value-first, short, or website redesign. The interface supports subject suggestions, selected-text rewrites, tone/CTA changes, a chat-style AI draft assistant, and explicit generation of another version. AI failures are shown to the user; the rule-based generator remains available only when selected as the fallback.

Drafts remain unsent until an operator reviews and explicitly sends them. Users can save, search, filter, edit, duplicate, delete, and set review/approval statuses; a saved draft becomes Sent only after the send function confirms success. Saved drafts can be linked to a prospect, campaign, and matching website audit. The AI endpoint uses the authenticated user's Supabase access token and row-level security, never accepts prospect/audit content from the browser, and keeps the OpenAI key server-side. AI generation is limited to 10 prospects per batch and 40 generation/edit/subject requests per account per rolling 24 hours.

Apply the migration and deploy the Edge Function before using AI generation:

```sh
npm run supabase:migrate
npx supabase functions deploy generate-outreach-draft
```

The function uses the existing server-side `OPENAI_API_KEY`. `OPENAI_EMAIL_MODEL` can optionally select a text-generation model; when unset, it uses `OPENAI_VISION_MODEL` and then the function's existing `gpt-4.1-mini` default. The sender name, email, and company come from the signed-in user's profile, with `ARLOTECH Digital Solutions` as the business-name fallback. The generated draft is not saved or sent unless the user chooses those actions.

Generate a separate signing secret with at least 32 random bytes. Keep the same value configured while links from previously sent emails may still be used:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
npx supabase secrets set OUTREACH_UNSUBSCRIBE_SECRET="paste-the-generated-value-here"
npx supabase secrets set RESEND_API_KEY=re_your_key RESEND_FROM_EMAIL="ArloTech <outreach@yourdomain.com>" OUTREACH_REPLY_TO_EMAIL="info@arlotech.com.ng" OUTREACH_POSTAL_ADDRESS="Your business postal address"
npx supabase functions deploy unsubscribe
npx supabase functions deploy send-outreach
```

The unsubscribe endpoint verifies signed, recipient-specific links and records the recipient in the sending account's suppression list. Browser links open the public `https://aoid.vercel.app/unsubscribe` confirmation page and do not unsubscribe until the recipient confirms. Email clients that support one-click unsubscribe submit the signed link directly to the Supabase endpoint. The Edge Function uses Supabase's server-side `SUPABASE_SERVICE_ROLE_KEY`; never expose that key to the browser. Do not rotate `OUTREACH_UNSUBSCRIBE_SECRET` casually, because doing so invalidates links already sent.

`OUTREACH_REPLY_TO_EMAIL` is added to new messages as their reply address. If it is not set, replies go to the email address in `RESEND_FROM_EMAIL`.

Apply the email recipient tracking migration before deploying the updated function:

```sh
npm run supabase:migrate
npx supabase functions deploy send-outreach
```

### Receive email replies

Configure Resend Receiving for the domain used by `OUTREACH_REPLY_TO_EMAIL`. Add the MX records shown in Resend's Receiving settings. If your main domain already uses another email provider, do not replace its MX records; use a dedicated receiving subdomain instead. In Resend, set an `email.received` webhook destination to:

```text
https://your-project-ref.supabase.co/functions/v1/resend-inbound
```

Set the signing secret shown in that webhook's details as a Supabase Edge Function secret, then apply the migration and deploy the receiver:

```sh
npx supabase secrets set RESEND_WEBHOOK_SECRET="whsec_your_webhook_signing_secret"
npx supabase db push --linked
npx supabase functions deploy resend-inbound
```

The receiver verifies Resend's signature, retrieves the message body from Resend, and links it to the most recent sent message from the same sender address. Replies without a matching recorded outbound recipient are acknowledged but not stored. After setup, send a new test email and reply to it; confirm that the webhook delivery succeeds in Resend and that the message appears on the Replies page. Replies to older messages continue to go to the address shown in those messages. Keep the signing secret server-side; never add it to Vite environment variables or frontend code.

### Possible email-open tracking and browser notifications

Resend open events are estimates: privacy tools and image proxies may trigger an open without a person reading the email. To enable them, turn on open tracking for the sending domain in Resend and add `email.opened` to the existing `resend-inbound` webhook's subscribed event types. Keep `email.received` enabled for replies.

Persistent browser notifications use Web Push and do not send notification emails or consume Resend sending quota. Generate one VAPID key pair with a trusted Web Push key generator:

```sh
npx web-push generate-vapid-keys
```

Save the output securely and configure the **same pair** in both places:

- Set `VITE_VAPID_PUBLIC_KEY` in the local `.env` and Vercel project environment.
- Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` as Supabase Edge Function secrets. `VAPID_SUBJECT` should be a contact URI such as `mailto:info@arlotech.com.ng`. Never put the private key in Vite variables or source control.

Set the server-side values using the key pair you generated:

```sh
npx supabase secrets set VAPID_PUBLIC_KEY=your_public_key VAPID_PRIVATE_KEY=your_private_key VAPID_SUBJECT="mailto:info@arlotech.com.ng"
```

Apply the migrations, deploy the updated receiver, and rebuild the frontend after configuring the public key:

```sh
npm run supabase:migrate
npx supabase functions deploy resend-inbound
npm run build
```

In the signed-in dashboard, open **Settings** and enable browser notifications. The browser must support notifications and the site must be served over HTTPS. The Replies page labels opens as possible, not confirmed. Notifications also appear in the dashboard while it is open. If push keys are not configured, the dashboard will explain that notifications cannot be enabled.

In **Email Drafts**, generate a draft for a prospect with a website link and send it after review and lawful-basis confirmation, write a one-off message to any recipient address, or select prospects with websites to prepare temporary previews. Missing email, category, contact name, or audit data does not prevent drafting; sending still requires a valid recipient, matching completed audit, evidence-backed customer issue, and all other eligibility checks. Website-specific messages with a usable audit include a matching review PDF and say it is attached. Previously contacted recipients are clearly labeled and require an explicit confirmation before resending. Suppressed addresses and prospects marked Do Not Contact remain blocked. Sent outreach includes the configured postal address and a working unsubscribe link, and no unsubscribe boilerplate is added to the draft body. The server caps sending at 50 messages per rolling 24 hours.


```sh
npm run build
npm run lint
npm test
```

## Conversion optimization update

See [`docs/CONVERSION-OPTIMIZATION-UPDATE.md`](docs/CONVERSION-OPTIMIZATION-UPDATE.md) for the dashboard conversion snapshot, measurement definitions, outreach operating playbook, and deployment notes. The update is additive and introduces no database migration.

## Growth Center and next-step implementation

The additive Growth Center is available at `/growth-center`. See `docs/GROWTH-CENTER-UPDATE.md` for what is implemented and what remains provider/schema dependent.
