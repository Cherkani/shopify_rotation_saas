# Milestone 5 — Click and campaign metrics

## Goal

Measure advertising traffic separately from orders.

## Work

- Count redirects by store and date.
- Preserve and aggregate selected UTM parameters.
- Display click totals in admin.
- Display order conversion counts.
- Keep order counts and click counts as separate metrics.

Do not store unnecessary personal data from query parameters. Define which parameters are allowed before collecting them.

## Acceptance criteria

- Redirect totals are attributable to the store that received traffic.
- Order totals remain deduplicated.
- Campaign metrics are visible without exposing secrets.
- Metrics do not materially slow the redirect path.
