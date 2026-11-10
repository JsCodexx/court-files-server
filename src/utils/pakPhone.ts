export function normalizePakPhone(value: string): string {
  let v = value.replace(/\D/g, '');
  if (v.startsWith('92') && v.length === 12) v = `0${v.slice(2)}`;
  return v;
}

export function isValidPakPhone(value: string): boolean {
  const v = normalizePakPhone(value.trim());
  return /^03\d{9}$/.test(v);
}
