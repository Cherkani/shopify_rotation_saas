# Milestone 3 — Admin dashboard

## Goal

Provide a protected interface for observing and controlling the rotator.

## Work

- Add Supabase Auth.
- Protect `/admin` with a server-side authorization check.
- Show the active store.
- Show each store's current order count.
- Show threshold progress.
- Show recent orders and rotation history.
- Add manual store switching.
- Add counter reset.
- Add enable/disable controls.
- Record every manual action in an audit log.

## Acceptance criteria

- Unauthenticated users cannot access admin data or actions.
- Admin mutations are authorized server-side.
- Manual changes affect the redirect endpoint correctly.
- Manual changes are auditable.
