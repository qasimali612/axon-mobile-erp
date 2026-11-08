import { AccountClass, CashFlowActivity, NormalBalance } from "@prisma/client";
import { z } from "zod";

const optionalUuid = z.string().uuid().optional().nullable();

export const accountCreateSchema = z.object({
  groupId: optionalUuid,
  parentId: optionalUuid,
  branchId: optionalUuid,
  costCenterId: optionalUuid,
  code: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9._-]+$/),
  name: z.string().trim().min(3).max(160),
  accountClass: z.nativeEnum(AccountClass),
  subclass: z.string().trim().min(2).max(80),
  accountType: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9_ -]+$/),
  normalBalance: z.nativeEnum(NormalBalance),
  currencyCode: z.string().trim().length(3).toUpperCase().optional().nullable(),
  isControlAccount: z.boolean().default(false),
  reconciliationRequired: z.boolean().default(false),
  allowManualJournal: z.boolean().default(true),
  cashFlowActivity: z.nativeEnum(CashFlowActivity).default(CashFlowActivity.NONE),
  description: z.string().trim().max(2_000).optional().nullable(),
});

export const accountUpdateSchema = accountCreateSchema
  .pick({
    name: true,
    groupId: true,
    parentId: true,
    branchId: true,
    costCenterId: true,
    subclass: true,
    accountType: true,
    currencyCode: true,
    isControlAccount: true,
    reconciliationRequired: true,
    allowManualJournal: true,
    cashFlowActivity: true,
    description: true,
  })
  .partial()
  .extend({ isActive: z.boolean().optional() });
