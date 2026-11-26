export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function formatCpfMask(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

export function formatPhoneMask(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

export function isValidCpf(rawCpf: string): boolean {
  const digits = onlyDigits(rawCpf);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(digits[i]) * (10 - i);
  }
  let rem = (sum * 10) % 11;
  if (rem === 10) rem = 0;
  if (rem !== Number(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(digits[i]) * (11 - i);
  }
  rem = (sum * 10) % 11;
  if (rem === 10) rem = 0;
  return rem === Number(digits[10]);
}

export function isValidBrPhone(rawPhone: string): boolean {
  const digits = onlyDigits(rawPhone);
  if (digits.length !== 10 && digits.length !== 11) return false;
  const ddd = Number(digits.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  if (digits.length === 11 && digits[2] !== '9') return false;
  return true;
}

export function normalizeFullName(rawName: string): string {
  return rawName.trim().replace(/\s+/g, ' ');
}

export function isValidFullName(rawName: string): boolean {
  const normalized = normalizeFullName(rawName);
  if (normalized.length < 5 || normalized.length > 100) return false;
  const parts = normalized.split(' ').filter((p) => p.length >= 2);
  if (parts.length < 2) return false;
  return /^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/.test(normalized);
}

export function maskCpf(rawCpf: string): string {
  const digits = onlyDigits(rawCpf);
  if (digits.length !== 11) return '***.***.***-**';
  return `${digits.slice(0, 3)}.***.***-${digits.slice(9, 11)}`;
}

export function maskPhone(rawPhone: string): string {
  const digits = onlyDigits(rawPhone);
  if (digits.length < 10) return '(**) *****-****';
  const ddd = digits.slice(0, 2);
  const last4 = digits.slice(-4);
  return `(${ddd}) ${digits.length === 11 ? '*****' : '****'}-${last4}`;
}

export function isValidBankAgency(rawAgency: string): boolean {
  const digits = onlyDigits(rawAgency);
  return digits.length >= 3 && digits.length <= 5 && !/^0+$/.test(digits);
}

export function isValidOptionalBankDigit(rawDigit: string): boolean {
  const trimmed = rawDigit.trim().toUpperCase();
  if (trimmed === '') return true;
  return /^[0-9X]$/.test(trimmed);
}

export function isValidBankAccount(rawAccount: string): boolean {
  const digits = onlyDigits(rawAccount);
  return digits.length >= 4 && digits.length <= 12 && !/^0+$/.test(digits);
}

export function isValidRequiredBankDigit(rawDigit: string): boolean {
  const trimmed = rawDigit.trim().toUpperCase();
  return /^[0-9X]$/.test(trimmed);
}

export function maskBankAgency(agency: string, digit?: string): string {
  const digits = onlyDigits(agency);
  const d = digit ? digit.trim().toUpperCase() : '';
  const tail = digits.slice(-2);
  const maskedBody = digits.length > 2 ? `${'*'.repeat(digits.length - 2)}${tail}` : digits;
  return d ? `${maskedBody}-${d}` : maskedBody;
}

export function maskBankAccount(account: string, digit: string): string {
  const digits = onlyDigits(account);
  const d = digit.trim().toUpperCase();
  const tail = digits.slice(-3);
  const maskedBody = digits.length > 3 ? `${'*'.repeat(digits.length - 3)}${tail}` : digits;
  return `${maskedBody}-${d}`;
}

export function isValidHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color.trim());
}
