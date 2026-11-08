# AXON MOBILE ERP — CYBERSECURITY & ACCESS CONTROL AUDIT
**Date:** November 2026  
**Auditor:** Cybersecurity Engineer & Risk Analyst  

---

## 1. Authentication & Session Security

- **Session Architecture**:
  - Secure server-side sessions stored in PostgreSQL (`Session` model).
  - Client token sent via HTTP-only, SameSite cookies.
  - Raw session tokens are never stored in plain text; tokens are hashed using SHA-256 (`tokenHash`) before database queries (`src/lib/auth.ts`).
  - Session expiration and idle timeout enforced.
- **Password Security**:
  - Passwords hashed using standard cryptographic algorithms with individual salts.
  - Password policy enforcement (`src/lib/password-policy.ts`) requiring minimum length, mixed character sets, and history checks.
  - Brute force protection: `LoginAttempt` records failed attempts and implements exponential backoff / lockout.

---

## 2. Authorization & RBAC Enforcement

- **Role-Based Access Control**:
  - Roles linked via `CompanyMembership` and `UserRole`.
  - Over 110 distinct granular permissions covering view, create, edit, submit, approve, post, reverse, and cost visibility.
  - All sensitive actions enforced on the server (`requirePermission`, `requirePagePermission`).
  - Hiding client UI buttons is never used as a sole security boundary.
- **Multi-Tenant & Branch Scoping**:
  - All Prisma queries enforce `companyId` matching the authenticated session context.
  - Branch-restricted users are restricted via `permittedBranchIds()`.
  - Cross-company data leaks are prevented at the database query level.
- **Cost & Margin Protection**:
  - Device acquisition costs and profit margins are redacted from API responses unless the user has `catalog.cost.view` or `report.profitability` permissions.

---

## 3. Data Integrity & Financial Protection

- **Append-Only Auditing**:
  - `AuditLog` captures user, action, entity, before/after values, and timestamps.
  - Normal users have no permission to modify or truncate audit logs.
- **Double-Entry Balance Enforcement**:
  - Database transactions enforce that debit equals credit on every posted journal.
  - Closed fiscal periods reject backdated postings (`assertPeriodOpen`).
- **Idempotency Protection**:
  - Mutation APIs require unique `idempotencyKey` values to prevent duplicate financial or inventory posting during network retries.
