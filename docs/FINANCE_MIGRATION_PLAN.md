# Finance ERP migration and rollout plan

Updated: 2026-10-27

## Objectives

- Preserve existing company, branch, warehouse, user, role, catalog, customer, supplier, return, inventory-document, attachment, session, and audit data.
- Add fiscal control, hierarchical accounts, immutable balanced journals, bank ledger, assets, incentives, rebates, budgets, opening balances, and statements.
- Remove every runtime dependency on the permanently excluded after-sales case-management scope.
- Never infer an opening balance from an editable master-field total. All opening figures must post as a balanced opening journal.

## Pre-migration controls

1. Put the application in maintenance mode for the migration window.
2. Verify a restorable PostgreSQL backup and record its checksum.
3. Record row counts and checksums for core tables.
4. Run dependency scans over schema, routes, scheduled work, role grants, navigation, reports, notifications, fixtures, and documentation.
5. Verify no uncommitted operational posting job is running.
6. Test the migration against a restored production-sized copy.
7. Define rollback ownership, timeout, and go/no-go checkpoints.

## Migration stages

### Stage A — non-destructive expansion

1. Create finance enums and tables.
2. Add foreign keys, tenant indexes, posting-date indexes, unique document identifiers, and fixed-point decimal columns.
3. Add granular authority keys without granting them automatically.
4. Seed a configurable account template, fiscal calendar, cost centers, and bank/asset account mappings only in development environments.
5. Leave operational writes on the prior release until validation completes.

### Stage B — safe scope retirement

1. Copy every non-null legacy product service-duration value into `Product.attributes.legacyRemoved` as historical information.
2. Deactivate legacy-only roles while retaining users, memberships, assignment history, and audit events.
3. Revoke and remove obsolete grants after recording the migration event.
4. Reclassify any legacy branch type into a supported operational branch type without deleting the branch or its dependent records.
5. Remove the old product column and enum value only after preservation queries succeed.
6. Confirm no route, page, scheduled task, permission key, dashboard card, fixture, notification, or report references the retired scope.

### Stage C — opening balances

1. Import source balances into an `OpeningBalanceBatch` draft.
2. Require account, party, bank, fixed-asset, reference, due-date, and branch dimensions where applicable.
3. Validate account class, currency, tenant scope, debit/credit shape, duplicates, and opening date.
4. Reconcile customer and supplier detail to their control-account totals.
5. Reconcile bank detail to source statements.
6. Reconcile fixed-asset cost and accumulated depreciation to the asset register.
7. Require total debit to equal total credit exactly at four-decimal base-currency precision.
8. Approve with a user other than the importer.
9. Post with a third authority in an open period, producing one immutable opening journal.

### Stage D — controlled cutover

1. Enable read-only finance pages first and compare reports with signed legacy reports.
2. Enable journal preparation, then approval, then posting for separately assigned roles.
3. Enable bank, asset, incentive, rebate, and budget workflows only after their posting tests pass.
4. Enable source-module posting for inventory, purchasing, and sales only when stock and accounting effects share one transaction.
5. Keep idempotency keys, structured logs, and reconciliation monitoring enabled from the first write.

## Validation queries

- Posted journals with debit not equal to credit: must be zero.
- Posted journals outside their linked period dates: must be zero.
- Posted journals in a closed period after its close timestamp: must be zero.
- Journal lines whose company or branch differs from the header: must be zero.
- Customer/supplier/bank dimensions from another company: must be zero.
- Bank transactions without a posted or reversed journal line: must be zero.
- Settlements exceeding accrued outstanding values: must be zero.
- Fixed assets with negative NBV or residual value above depreciable cost: must be zero.
- Balance-sheet difference: exactly zero; never auto-plugged.
- Retired permission keys and active legacy-only roles: must be zero.

## Rollback strategy

- Before write cutover: restore the verified backup or roll back the expansion migration.
- After finance writes begin: do not drop finance tables. Stop writes, investigate, and use compensating migrations or authorized reversing journals.
- Never restore only accounting tables independently of operational source tables after integrated posting begins.
- If a source posting fails midway, the database transaction must roll back the source document, stock effects, subledger effects, journal, bank rows, and audit outcome together.

## Deployment evidence

Store the following with each release:

- Migration SQL and hash
- Backup verification output
- Before/after row counts
- Dependency scan output
- Trial-balance comparison
- Balance-sheet zero-difference evidence
- Permission assignment review
- Period-close and reopen evidence
- Idempotency and concurrency test output
- Sign-off by finance owner and technical owner
