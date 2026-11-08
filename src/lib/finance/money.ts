import { Prisma } from "@prisma/client";

export const MONEY_SCALE = 4;

export type MoneyInput = string | Prisma.Decimal;

export function decimal(value: MoneyInput) {
  const result = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
  if (!result.isFinite()) throw new Error("Invalid monetary value.");
  return result.toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

export function zero() {
  return new Prisma.Decimal(0);
}

export function sumMoney(values: MoneyInput[]) {
  return values.reduce<Prisma.Decimal>((total, value) => total.plus(decimal(value)), zero()).toDecimalPlaces(
    MONEY_SCALE,
    Prisma.Decimal.ROUND_HALF_UP,
  );
}

export function moneyString(value: MoneyInput) {
  return decimal(value).toFixed(MONEY_SCALE);
}
