/**
 * Strip characters that have meaning in PostgREST's `.or()` / filter grammar
 * (comma, parentheses, dot, colon, asterisk) and in ilike patterns (%, _, \).
 *
 * User-supplied search text must be sanitized before being interpolated into
 * `.or("col.ilike.%${text}%")` style filters — otherwise input like
 * `foo,bar.ilike.%` can break out of the intended clause and add arbitrary
 * OR conditions.
 */
export function sanitizePostgrestPattern(input: string): string {
  return (input ?? "")
    .replace(/[,()*:\\%_]/g, "")
    .replace(/\./g, " ")
    .trim();
}
