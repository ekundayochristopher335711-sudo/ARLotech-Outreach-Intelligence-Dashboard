# Arlotech Outreach Intelligence Dashboard

A web app for organizing an outreach pipeline: review prospect metrics, keep prospect records, group work into campaigns, and track outreach activity. The current app is a React/Vite frontend backed by Supabase Auth and Postgres.

## Run locally

Requirements: Node.js 20.19+ or 22.12+ and npm.

1. Install packages:

   ```sh
   npm ci
   ```

2. Create a Supabase project. Apply `supabase/migrations/20240101_01_create_core_tables.sql` in the Supabase SQL Editor, or link the Supabase CLI to the project and run:

   ```sh
   npm run supabase:migrate
   ```

3. Copy `.env.example` to `.env` and enter the project URL and public anon/publishable key on separate lines. Do not use or expose the `service_role` key in this browser app.

   ```env
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-public-anon-or-publishable-key
   ```

4. Create a user in Supabase **Authentication → Users**. The app currently supports sign-in only; it does not have a sign-up flow or a seeded demo user.
5. Start the app:

   ```sh
   npm run dev
   ```

The migration enables row-level security and scopes records to their owning Supabase user.

## Deploy

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel for each environment you use, then deploy/redeploy so Vite embeds the values in the client build. Keep the anon/publishable key public and rely on the database's row-level security; never add a service-role key to a `VITE_` variable.

## Current scope

The dashboard reads Supabase metrics and activity. The prospect list supports search, manual creation, and CSV import. CSV files must include a `business_name` header; supported optional headers are `contact_name`, `email`, `website`, `business_category`, `city`, `country`, `phone`, `linkedin_url`, `notes`, `source`, `status`, and `do_not_contact`.

Editing/deleting prospects and creating campaigns are not yet wired up, and email drafts currently show a placeholder. There is no backend/API implementation for AI website analysis or AI email generation, and the app does not send email. These workflows need to be implemented and connected to the relevant providers before the dashboard can run a complete automated outreach campaign.


## Website Intelligence integrations

The Website Intelligence page orchestrates three Supabase Edge Functions:

- `pagespeed-insights` — calls the Google PageSpeed Insights API (Lighthouse) for performance, accessibility, SEO and best-practices scores plus audit details.
- `extract-content` — fetches the target page server-side and extracts title, meta, headings, text, links, images, schema.org, etc.
- `gemini-analysis` — sends the extracted content + PageSpeed data to the Gemini API and returns an AI summary, score explanation, recommendations and observations.

The combined report is stored in the `website_analyses` Supabase table.

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


```sh
npm run build
npm run lint
```
