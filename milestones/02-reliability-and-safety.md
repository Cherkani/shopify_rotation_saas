# Milestone 2 — Reliability and safety

## Goal

Make the MVP safe to test with real but limited traffic.

## Work

- Add `/api/health`.
- Validate Shopify URLs and domains.
- Handle disabled stores.
- Add safe behavior when no store is available.
- Add structured logs for redirects, webhooks, and rotations.
- Add tests for concurrent webhook processing.
- Handle Shopify retries predictably.
- Add request-size and payload validation.
- Confirm secrets are never returned to clients or logs.

## Acceptance criteria

- Health checks detect broken Supabase state.
- Invalid store configuration cannot become a redirect destination.
- Concurrent orders cannot cause duplicate rotations.
- Operational errors are visible in Vercel logs.
- All security and failure tests pass.
