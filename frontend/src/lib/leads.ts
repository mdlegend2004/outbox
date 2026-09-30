const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SINGLE_EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

export const isEmail = (s: string) => SINGLE_EMAIL_RE.test(s.trim());

/**
 * Extract unique email addresses from CSV / plain text content.
 * Works regardless of column order, delimiters or headers: any token that
 * looks like an email is a lead. Order of first appearance is preserved.
 */
export function parseLeads(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.match(EMAIL_RE) ?? []) {
    seen.add(match.toLowerCase());
  }
  return [...seen];
}

export function mergeRecipients(existing: string[], incoming: string[]): string[] {
  const set = new Set(existing);
  for (const e of incoming) set.add(e.toLowerCase());
  return [...set];
}
