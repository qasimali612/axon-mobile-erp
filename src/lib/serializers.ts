import type { Prisma } from "@prisma/client";

export function decimalString(value: Prisma.Decimal | number | string | null | undefined) {
  return value == null ? null : value.toString();
}

export function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => {
      if (typeof item === "bigint") return item.toString();
      if (item && typeof item === "object" && item.constructor?.name === "Decimal") return item.toString();
      return item;
    }),
  ) as T;
}
