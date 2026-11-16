## 2026-11-10T12:20:04Z
Read the authoritative user request at:
d:\Inventory Managment Software\.agents\teamwork\ORIGINAL_REQUEST.md

Subagent Identity:
- Name: test_writer_e2e
- Role: E2E Test Suite Writer
- Working directory: d:\Inventory Managment Software\.agents\teamwork\test_writer_e2e\

Scope & Architecture Document:
- d:\Inventory Managment Software\.agents\teamwork\orchestrator\PROJECT.md

Mandate:
You lead the E2E Testing Track for the Axon Mobile ERP POS Counter Terminal.
Design and create an automated, requirement-driven, opaque-box test suite derived strictly from user requirements in ORIGINAL_REQUEST.md.

Methodology (4 Tiers):
- Tier 1: Feature Coverage (>=5 tests per feature)
- Tier 2: Boundary & Corner Cases (>=5 tests per feature)
- Tier 3: Cross-Feature Combinations (pairwise coverage)
- Tier 4: Real-World Retail Application Scenarios

Tasks:
1. Initialize your progress.md and BRIEFING.md.
2. Author d:\Inventory Managment Software\TEST_INFRA.md defining test architecture, feature inventory, methodology, and pass/fail semantics.
3. Author the comprehensive automated test suite in Vitest under `src/` (e.g. `src/lib/operations/pos-acceptance.test.ts`) covering all R1-R5 acceptance criteria:
   - Scanning either IMEI1 or IMEI2 resolves to same physical handset; duplicate rejected.
   - Handset cart quantity fixed at 1 per physical unit.
   - Accessory quantity stock validation and negative stock prevention.
   - Atomic checkout transaction and idempotent posting.
   - Double-entry balanced GL entries (AR, Revenue, Tax, COGS, Inventory) and specific identification landed cost.
   - Sequential document numbering format `ISB-SI-FY2026-27-000001` with hyphen sanitization.
   - Shift management cash drawer reconciliation strictly excluding card/digital tenders.
   - Parked cart holding without reservation and recall.
   - IMEI-traceable customer returns and GL credit reversals.
4. When tests are authored and ready, publish d:\Inventory Managment Software\TEST_READY.md at the project root.
5. Deliver handoff.md and notify orchestrator via send_message.
