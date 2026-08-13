/**
 * Duplicate detection for clerk-owned judge/advocate names.
 * Works for English (case, spacing, punctuation) and Urdu/Arabic script
 * (diacritics, alef/yeh/kaf/heh variants, tatweel, zero-width marks).
 */

const INVISIBLE =
  /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;
const WHITESPACE = /[\s\u00A0\u2000-\u200A\u2028\u2029\u202F\u3000]+/g;
const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const ASCII_PUNCT = /[.,;:'"!?()[\]{}]/g;

/** Collapse spaces / invisibles but keep the clerk's original letters and case. */
export function formatPersonName(raw: string): string {
  return (raw || '')
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(WHITESPACE, ' ')
    .trim();
}

/**
 * Canonical key for comparing two names as "the same person".
 * Urdu has no case, but letter-shape variants and tashkeel are unified.
 */
export function normalizePersonName(raw: string): string {
  let s = formatPersonName(raw);

  s = s.replace(/\u0640/g, '');
  s = s.replace(ARABIC_DIACRITICS, '');

  s = s.replace(/[أإآٱ]/g, 'ا');
  s = s.replace(/[يىئ]/g, 'ی');
  s = s.replace(/ك/g, 'ک');
  s = s.replace(/[ةهھۀ]/g, 'ہ');
  s = s.replace(/ؤ/g, 'و');

  s = s.toLocaleLowerCase('en');
  s = s.replace(ASCII_PUNCT, '');
  s = s.replace(WHITESPACE, ' ').trim();

  return s;
}

export function personNamesEqual(a: string, b: string): boolean {
  const left = normalizePersonName(a);
  const right = normalizePersonName(b);
  if (!left || !right) return false;
  return left === right;
}

export function findByNormalizedName<T extends { name: string }>(
  items: T[],
  name: string
): T | undefined {
  const key = normalizePersonName(name);
  if (!key) return undefined;
  return items.find((item) => normalizePersonName(item.name) === key);
}
