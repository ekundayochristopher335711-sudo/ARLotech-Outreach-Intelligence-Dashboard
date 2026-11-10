# ARLOTECH implementation handoff

## Implemented in this source update

- Added `supabase/functions/analyze-website-visuals/index.ts`.
  - Requires a valid Supabase user session.
  - Confirms the audit belongs to the authenticated user.
  - Downloads real screenshot objects from the private Storage bucket server-side.
  - Confirms each screenshot object path is scoped to the signed-in user and requested audit.
  - Sends the actual desktop/mobile screenshot image data to the OpenAI Responses API.
  - Uses `OPENAI_VISION_MODEL` (default `gpt-4.1-mini`) and server-only `OPENAI_API_KEY`.
  - Validates the response structure, severity, category, device, confidence, score, and required evidence fields.
  - Persists visual score, assessment, findings, model, timestamp, coverage, and usage under `analysis_details.visual_audit`.
- Connected the existing screenshot capture + private storage workflow to the new Edge Function. Visual-analysis failure does not discard a successful technical audit; it is recorded as a failed visual-analysis state.
- Updated the Website Intelligence screenshot panel to show AI visual score, explanation, evidence-backed findings, severity, device, confidence, and improvement type.
- Extended the client-facing PDF report with a separate AI visual design assessment and individual visual findings. The existing Lighthouse technical score remains distinct.
- Added a migration to restore owner-scoped private screenshot object policies and index visual-analysis status.
- Documented Edge Function secrets and deployment commands in README and `.env.example`.

## Deployment and configuration status

`OPENAI_API_KEY` is configured as a Supabase Edge Function secret. `OPENAI_VISION_MODEL` is optional and defaults to `gpt-4.1-mini`. Do not add either as a `VITE_` variable.

The visual audit migration has been applied and `analyze-website-visuals` is deployed with JWT verification enabled. The legacy `gemini-analysis`, `gemini-outreach`, and `extract-leads` functions were deleted from the linked project.

The function relies on Supabase's standard `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` Edge Function environment values.

## Verification status

- `npm test` passed: 26 test files, 173 tests.
- `npm run build` passed.
- `npm run lint` passed with existing warnings in `Prospects.tsx` and `EmailDrafts.tsx`.
- Static review and deployment do not verify a live authenticated screenshot-analysis request or PDF output.
- Rotate credentials that may have been exposed by the previous secret-list command before running an end-to-end test. Do not share replacement values in chat.
- The Edge Function was deployed, but Deno runtime/type validation was unavailable locally.
- Full cross-application UI redesign and end-to-end testing of every outreach workflow remain outside the verified scope of this source update.
