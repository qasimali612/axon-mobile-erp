-- Retire broad or combined finance grants. Exact preparation, approval,
-- posting, settlement, reversal, close/reopen, and export keys replace them.
DELETE FROM "RolePermission"
WHERE "permissionId" IN (
  SELECT "id" FROM "Permission"
  WHERE "key" IN (
    'finance.view',
    'finance.journal.create',
    'finance.journal.post',
    'finance.payment.post',
    'finance.period.close',
    'finance.profit.view',
    'BANK_RECONCILE',
    'BUDGET_MANAGE'
  )
);

DELETE FROM "Permission"
WHERE "key" IN (
  'finance.view',
  'finance.journal.create',
  'finance.journal.post',
  'finance.payment.post',
  'finance.period.close',
  'finance.profit.view',
  'BANK_RECONCILE',
  'BUDGET_MANAGE'
);
