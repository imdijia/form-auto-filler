/**
 * Independent legality oracle for QA assertions.
 *
 * This is deliberately written from the published standard / contract, NOT
 * imported from the implementation under test. If the product generator
 * shares a bug with this oracle it still cannot fake a pass: the oracle is
 * fixed, public knowledge (GB 11643 weighting, CN mobile numbering plan),
 * and every check is a real comparison, never `expect(true).toBe(true)`.
 */
export const ID_CARD_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2] as const;
export const ID_CARD_CHECK_MAP = '10X98765432';

/** GB/T 2260 two-digit province prefixes (mainland, incl. 71/81/82). */
export const CN_PROVINCE_PREFIXES: ReadonlySet<string> = new Set([
  '11', '12', '13', '14', '15',
  '21', '22', '23',
  '31', '32', '33', '34', '35', '36', '37',
  '41', '42', '43', '44', '45', '46',
  '50', '51', '52', '53', '54',
  '61', '62', '63', '64', '65',
  '71', '81', '82',
]);

export const PHONE_PATTERN = /^1[3-9][0-9]{9}$/;
export const IDCARD_PATTERN = /^[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dX]$/;

/** Real calendar date check (rejects 20230230, 19901301, future births). */
export function isValidBirthDate(yyyymmdd: string, now: Date = new Date('2026-11-09T00:00:00Z')): boolean {
  if (!/^\d{8}$/.test(yyyymmdd)) return false;
  const year = Number(yyyymmdd.slice(0, 4));
  const month = Number(yyyymmdd.slice(4, 6));
  const day = Number(yyyymmdd.slice(6, 8));
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return false;
  }
  return d.getTime() <= now.getTime();
}

export function idCardCheckDigit(first17: string): string {
  let sum = 0;
  for (let i = 0; i < 17; i += 1) {
    sum += Number(first17[i]) * ID_CARD_WEIGHTS[i];
  }
  return ID_CARD_CHECK_MAP[sum % 11];
}

export interface IdCardVerdict {
  ok: boolean;
  reasons: string[];
  birthDate: string;
  regionCode: string;
  sequenceCode: string;
}

/** Full GB 11643 verdict. All four conditions must hold. */
export function checkIdCard(value: string): IdCardVerdict {
  const reasons: string[] = [];
  const birthDate = value.slice(6, 14);
  const regionCode = value.slice(0, 6);
  const sequenceCode = value.slice(14, 17);

  if (value.length !== 18) reasons.push(`length=${value.length}, expected 18`);
  if (!IDCARD_PATTERN.test(value)) reasons.push('format/pattern mismatch');
  if (!CN_PROVINCE_PREFIXES.has(regionCode.slice(0, 2))) {
    reasons.push(`illegal province prefix ${regionCode.slice(0, 2)}`);
  }
  if (!/^\d{6}$/.test(regionCode)) reasons.push(`region code not 6 digits: ${regionCode}`);
  if (!isValidBirthDate(birthDate)) reasons.push(`illegal birth date: ${birthDate}`);
  if (!/^\d{3}$/.test(sequenceCode)) reasons.push(`sequence code not 3 digits: ${sequenceCode}`);

  if (value.length === 18 && /^\d{17}[\dX]$/.test(value)) {
    const expected = idCardCheckDigit(value.slice(0, 17));
    if (value[17] !== expected) {
      reasons.push(`check digit ${value[17]} != ${expected} (GB 11643)`);
    }
  } else {
    reasons.push('check digit not verifiable (body not 17 digits)');
  }

  return { ok: reasons.length === 0, reasons, birthDate, regionCode, sequenceCode };
}

/** Normalize YYYY-MM-DD / YYYY/MM/DD / YYYYMMDD to the 8 digits used in the ID. */
export function stripDateSeparators(value: string): string {
  return value.replace(/\D/g, '');
}

export function isMaleLabel(value: string): boolean {
  return /男|male|^m$|^1$/i.test(value.trim());
}

export function isFemaleLabel(value: string): boolean {
  return /女|female|^f$|^0$/i.test(value.trim());
}

/** True when the parity of ID position 17 (index 16) matches the gender label. */
export function genderMatchesIdCard(idCard: string, gender: string): boolean {
  const seq = Number(idCard[16]);
  const oddIsMale = seq % 2 === 1;
  return (oddIsMale && isMaleLabel(gender)) || (!oddIsMale && isFemaleLabel(gender));
}

/** Float-safe check that value lies on the min + k*step lattice. */
export function onStepLattice(value: number, min: number, step: number, epsilon = 1e-9): boolean {
  if (step <= 0) return true;
  const k = (value - min) / step;
  return Math.abs(k - Math.round(k)) < epsilon;
}
