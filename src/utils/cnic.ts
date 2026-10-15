/** Strip CNIC to digits only for search/compare (ignores dashes and spaces). */
export function normalizeCnic(value: string): string {
  return String(value ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\D/g, '');
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** Partial or near-exact CNIC match (typo-tolerant for 10+ digit queries). */
export function cnicDigitsMatch(stored: string, query: string): boolean {
  const card = normalizeCnic(stored);
  const q = normalizeCnic(query);
  if (!card || !q) return false;
  if (card.includes(q) || q.includes(card)) return true;
  if (q.length >= 10 && card.length >= 10) {
    return levenshtein(card, q) <= 2;
  }
  if (q.length >= 5) {
    const head = q.slice(0, 5);
    return card.includes(head);
  }
  return false;
}
