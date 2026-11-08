# Phase 1 acceptance evidence

## Automated checks

Run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
DATABASE_URL="postgresql://..." npm run test:db-controls
```

Current unit coverage includes password policy and IMEI normalization/Luhn semantics. API and database smoke tests are described below; later phases add full Playwright workflows and concurrent posting tests.

## Database checks

- Migration applies to PostgreSQL-compatible engine from empty state.
- Seed can be rerun without duplicating reference records.
- Duplicate company SKU/barcode returns a unique conflict.
- Cross-company warehouse/product relationships are rejected by triggers.
- `AuditLog` update/delete is rejected by `AuditLog_immutable` trigger.
- Price and reorder fields reject negatives; minimum selling price cannot exceed retail.
- Company fiscal month and decimal precision have check constraints.

## Authentication checks

- Valid credential creates HttpOnly session and a login audit event.
- Invalid credential returns the same message for missing/wrong users.
- Repeated failures throttle and temporarily lock.
- Suspended user/membership cannot establish company context.
- Temporary-password user is redirected to password replacement.
- Password change revokes other sessions and writes audit.
- Logout revokes current session.

## Authorization checks

- Protected APIs return 401 without a session.
- Missing action grant returns 403 even when called directly.
- Branch/warehouse context cannot leave role scope.
- IDs from another company resolve as absent/invalid.
- System roles cannot be edited through the custom-role endpoint.
- Owner cannot suspend self or be suspended before ownership transfer.

## Functional checks

- Create, edit, filter, paginate, export and archive a product.
- Phone types force IMEI tracking; accessories may use quantity/batch/serial.
- Create/edit/archive branch with active-warehouse safeguard.
- Create/edit/archive warehouse with default-warehouse safeguard.
- Create user with temporary password and scoped role; edit/suspend revokes sessions.
- Create and update a custom role.
- Filter and export audit events; inspect before/after payload.
- Dashboard cards navigate to their real filtered domain pages.

## Explicit exclusions

No stock balance, inventory value, sales, purchase, or accounting assertion is part of the Phase 1 acceptance baseline. Later database-backed finance rollout is tracked separately and is not retroactively represented as Phase 1 completion.
