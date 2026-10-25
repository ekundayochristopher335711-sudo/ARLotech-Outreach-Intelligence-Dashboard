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

The dashboard reads Supabase metrics and activity, and the prospect list is backed by Supabase. Several visible controls are not wired up yet: adding/importing prospects and creating campaigns are incomplete, and email drafts currently show a placeholder. There is no backend/API implementation for AI website analysis or AI email generation, and the app does not send email. These workflows need to be implemented and connected to the relevant providers before the dashboard can run a complete automated outreach campaign.

## Checks

```sh
npm run build
npm run lint
```
