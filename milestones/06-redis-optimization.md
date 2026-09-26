# Milestone 6 — Redis optimization

## Goal

Reduce database work if redirect volume becomes high.

## Work

Add Upstash Redis through Vercel only when measurements justify it. Use it for:

- Fast active-store reads.
- High-volume redirect counters.
- Short-lived idempotency keys.
- Hot rotation state where appropriate.

Supabase remains the durable source for orders and rotation history. Define a recovery/reconciliation process before Redis becomes authoritative for live rotation.

## Acceptance criteria

- Redis failures have a safe fallback.
- Redis and Supabase state can be reconciled.
- Atomic rotation behavior remains correct.
- Redirect latency improves under representative load.
- Usage and cost are monitored.
