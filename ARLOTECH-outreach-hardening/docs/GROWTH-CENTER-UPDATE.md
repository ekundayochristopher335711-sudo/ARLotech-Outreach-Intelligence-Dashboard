# Growth Center update

Added `/growth-center` as an additive workspace area. It reads the current user's prospect, completed website analysis, email message and follow-up sequence records through Supabase.

## Included now

- Transparent heuristic prospect prioritization. It is an opportunity triage score, not a purchase-intent prediction.
- Pipeline counts for New, Ready for Outreach, Contacted, Replied, Interested, Meeting Booked and Won.
- Operational sent/reply/failure counts and a deliverability checklist that explicitly marks DNS/reputation checks as requiring authoritative verification.
- Client-side proposal PDF export with prospect selection and editable service, scope, confirmed price and timeline. The proposal is not sent automatically and does not invent payment/legal terms.
- New route and sidebar entry; existing dashboard pages and themes remain in place.

## Deliberately not claimed as complete

The workspace does not yet perform authoritative SPF/DKIM/DMARC DNS checks, consume provider delivery/complaint webhooks, pause campaigns server-side, persist proposals, or calculate revenue. Those require confirmed provider event contracts and/or schema changes. The Copilot brief lists safe implementation requirements for these next steps.

No database migration is included.
