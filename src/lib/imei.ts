/**
 * Validates format and the Luhn check digit only. It does not establish device
 * authenticity, ownership, network approval, or regulatory status.
 */
export function normalizeImei(value: string) {
  return value.replace(/[\s-]/g, "");
}

export function isValidImei(value: string) {
  const imei = normalizeImei(value);
  if (!/^\d{15}$/.test(imei)) return false;

  let sum = 0;
  for (let index = 0; index < imei.length; index += 1) {
    let digit = Number(imei[index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}
