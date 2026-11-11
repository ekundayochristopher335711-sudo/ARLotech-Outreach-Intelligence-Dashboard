# Prospect Relationship Management — Phase 3

## What changed

- Added a relationship workspace to each prospect profile.
- Added an inline pipeline-stage control using the existing prospect status field. Selecting **Do Not Contact** also sets the existing suppression flag; changing the stage later does not silently clear that flag.
- Added prospect-linked follow-up task creation, due dates, priority, status updates, and deletion using the existing `tasks` table.
- Added a prospect-specific relationship-notes stream using the existing `prospect_notes` table.
- Added proposal tracking with title, scope summary, optional amount/currency, follow-up date, optional document URL, internal notes, and Draft/Sent/Accepted/Declined/Expired status.
- Added a database migration with owner-scoped row-level security policies and indexes for proposal records.
- Pipeline and proposal status changes are written to the existing activity log, so they can appear in the prospect engagement timeline.

## Database action required

Apply `supabase/migrations/20261112090000_prospect_relationship_management.sql` to the Supabase project before using proposal tracking. The tasks and notes features use existing tables. No existing data is deleted or rewritten.

## Important behavior

- Changing a proposal's status to **Sent** records a sent timestamp; it does not send an email or transmit a proposal document.
- A proposal document URL is only stored as a reference and opened by the user.
- Setting the pipeline stage to **Do Not Contact** also enables the existing `do_not_contact` flag. Moving the stage away from it does not automatically re-enable outreach; the suppression flag must be explicitly reviewed in the prospect editor.
- All reads and writes are scoped by the signed-in user and prospect ID, with database RLS as an additional boundary.

## Validation

TypeScript transpile/syntax checks passed for the modified TSX and database type files. Full dependency-backed type checking, tests, and production build were not run because `npm ci` timed out in this environment.
