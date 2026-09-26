# Milestone 4 — Configurable settings

## Goal

Allow store and threshold changes without redeploying the application.

## Work

Move these values from constants or deployment configuration into protected database settings:

- Order threshold.
- Store names.
- Store URLs.
- Shopify domains.
- Rotation order.
- Enabled/disabled state.

Keep validation and safe defaults on the server.

## Acceptance criteria

- An authorized admin can change the threshold.
- An authorized admin can update a store URL.
- Changes are validated before becoming active.
- Changes are recorded in the audit log.
- Existing redirect and webhook behavior remains correct.
