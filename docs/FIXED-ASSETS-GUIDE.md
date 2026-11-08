# Fixed Assets — Behaviour, Controls, and Limits

**Status:** implemented core, acceptance-covered on 2026-10-29 (`npm run test:fixed-assets-acceptance`).  
**Code:** `src/lib/finance/assets.ts`, `src/lib/finance/asset-validation.ts`, `src/app/api/finance/asset-categories/**`, `src/app/api/finance/assets/**`, `src/components/finance/asset-workspace.tsx`, `src/app/(erp)/finance/assets/page.tsx`.  
**Schema:** `AssetCategory`, `FixedAsset`, `AssetDepreciationSchedule`, `AssetTransaction`, `AssetDisposal` (migrations through `20261028001400_asset_posting_controls`).

## Permissions

| Action | Permission | Typical roles |
|---|---|---|
| View register, categories, schedules | `ASSET_VIEW` | Accountant, controller, treasury, auditor, owner |
| Create/edit draft assets, capitalize, generate depreciation | `ASSET_CREATE` | Accountant, finance controller |
| Post generated depreciation | `ASSET_DEPRECIATION_POST` | GL posting officer |
| Dispose an asset | `ASSET_DISPOSAL_APPROVE` | Finance controller |
| Maintain asset categories and ledger mapping | `ASSET_CATEGORY_MANAGE` | Accountant |

Every endpoint re-checks the permission server-side, and asset creation is additionally checked against the acting user's branch scope.

## Category master

- Four **distinct** ledger accounts per category: asset cost (`ASSET`), accumulated depreciation (`ASSET`), depreciation expense (`EXPENSE`/`COGS`), disposal gain or loss (`REVENUE`/`EXPENSE`).
- Classification is validated, not trusted from the client.
- Once any asset references a category, the four-account mapping is immutable (`ASSET_CATEGORY_ACCOUNTS_LOCKED`); name, policy defaults and the active flag stay editable.
- Inactive categories cannot receive new assets.

## Asset lifecycle

```
DRAFT ──capitalize──▶ ACTIVE ──depreciation──▶ FULLY_DEPRECIATED
                          │                          │
                          └────────── dispose ───────┴──────▶ DISPOSED
```

- **Draft** — cost = purchase cost + additional cost; residual must be below cost; straight line needs `usefulLifeMonths`, declining balance needs `depreciationRate`, a depreciable category cannot use `NONE`. Drafts never write journals.
- **Capitalization** — requires a settlement account that differs from the asset cost account. Posts a balanced journal immediately (`Dr` cost account / `Cr` settlement) with document type `FIXED_ASSET_CAPITALIZATION` and starts depreciation at the capitalization month end unless a start date is supplied. A capitalized asset cannot be edited or capitalized twice.
- **Depreciation generation** — one row per asset per month (`assetId + periodDate` unique). Straight line spreads `(cost − residual) ÷ life` with cumulative rounding; declining balance charges `rate ÷ 12 × net book value`; both are capped at the remaining depreciable base. Generation is idempotent and skips fully depreciated assets and assets whose depreciation start is in the future.
- **Depreciation posting** — one balanced journal per schedule (`Dr` depreciation expense / `Cr` accumulated depreciation), schedule marked `POSTED` against its voucher, asset accumulated depreciation and net book value rolled forward, and status moved to `FULLY_DEPRECIATED` when the residual floor is reached. Posting the same month twice returns `NO_PLANNED_DEPRECIATION`.
- **Disposal** — allowed from `ACTIVE`, `FULLY_DEPRECIATED`, `IMPAIRED`, `HELD_FOR_SALE`. Blocked while planned (unposted) depreciation exists, requires a reason of at least ten characters, requires a receiving account when proceeds are non-zero, and records cost, accumulated depreciation, net book value and gain/loss at disposal. Journal: `Dr` accumulated, `Cr` cost, `Dr` proceeds account, and `Cr` gain or `Dr` loss to the category disposal account.

## Segregation of duties (mandatory)

The database enforces maker–checker on every voucher. Fixed-asset journals follow the same rule as stock adjustments:

- The user who created the asset draft is recorded as the journal **preparer** and cannot capitalize or dispose that asset.
- The user who generated depreciation schedules is recorded as their generator and cannot post those schedules.
- The acting user becomes both approver and posting officer, and must differ from the preparer. Violations return `MAKER_CHECKER_REQUIRED`; the workspace hides/disables the action and explains why.

This is why capitalization needs two authorized users in practice: an accountant drafts, a controller (or another `ASSET_CREATE` holder) capitalizes.

## Accounting integration

- Journals use `sourceModule = "FIXED_ASSET"`, `voucherType = SYSTEM`, document type `ASSET` with suffix `FA`, and cash-flow classification `INVESTING`.
- Idempotency key: `FIXED_ASSET_CAPITALIZATION|ASSET_DEPRECIATION|FIXED_ASSET_DISPOSAL:<sourceId>:<YYYY-MM-DD>` — a fixed-asset event can never post twice.
- Each journal is created as a draft with its lines, then transitioned to `POSTED` with approval/post metadata so the database posting guard validates balance, line count and independence.
- Rows are linked back: `AssetTransaction` (ACQUISITION / DEPRECIATION / DISPOSAL), `AssetDepreciationSchedule.journalEntryId`, `AssetDisposal.journalEntryId`, and audit events `ASSET_CATEGORY_CREATED`, `ASSET_CATEGORY_UPDATED`, `FIXED_ASSET_DRAFT_CREATED`, `FIXED_ASSET_DRAFT_UPDATED`, `FIXED_ASSET_CAPITALIZED`, `ASSET_DEPRECIATION_GENERATED`, `ASSET_DEPRECIATION_POSTED`, `FIXED_ASSET_DISPOSED`.

## Workspace

`/finance/assets` — register tab (search, status filter, cost/accumulated/NBV/planned cards, per-asset detail with schedule and ledger history), categories tab (mapping, lock state, usage counts), depreciation tab (month picker, generate, post, planned vs posted totals). All figures are server-computed; the workspace only displays them.

## API surface

| Method & path | Purpose |
|---|---|
| `GET/POST /api/finance/asset-categories` | List categories with account codes and usage; create |
| `PATCH /api/finance/asset-categories/[id]` | Update policy defaults, active flag, or mapping while unused |
| `GET/POST /api/finance/assets` | Register with lookups (categories, branches, users, accounts, suppliers); create draft |
| `GET/PATCH /api/finance/assets/[id]` | Asset detail with schedules/transactions; edit draft |
| `POST /api/finance/assets/[id]/capitalize` | Post acquisition |
| `POST /api/finance/assets/[id]/dispose` | Post disposal |
| `GET /api/finance/assets/depreciation?period=YYYY-MM` | Planned/posted schedules for a month |
| `POST /api/finance/assets/depreciation/generate` | Generate monthly schedules (optional `categoryId`) |
| `POST /api/finance/assets/depreciation/post` | Post schedules for a month (optional `scheduleIds`) |

## Acceptance coverage

`scripts/verify-fixed-assets-acceptance.ts` (11 groups): permission boundaries; category account validation, duplicate code and mapping lock; draft cost/residual/policy validation with no ledger effect; draft edit + independent capitalization; acquisition journal lines and preparer/poster identity; schedule generation, idempotency and SL/DB amounts; depreciation posting, expense/accumulated lines, fully-depreciated transition and re-post rejection; next-month generation skipping fully depreciated assets, planned-depreciation disposal block, self-posting rejection; disposal gain/loss lines and duplicate-disposal rejection; cost and accumulated depreciation reconciliation between ledger and subledger; audit events and authenticated workspace render.

## Known limits

- No asset transfer between branches or custodians, no revaluation, no impairment workflow, no partial disposal.
- Depreciation runs monthly only (no daily/pro-rata convention) and uses the fixed monthly rate rather than a policy-driven pro-rata month.
- No asset label printing, asset register export, or capital-commitment report yet.
- Straight-line rounding is cumulative at 4 decimals; sub-cent differences are suppressed at the residual cap.
