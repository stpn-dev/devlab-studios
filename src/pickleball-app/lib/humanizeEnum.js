// "OPEN_PLAY" -> "Open Play", "FIXED_PAIRS" -> "Fixed Pairs" -- generic
// enum-to-title-case, not a hardcoded map, so it keeps working if
// createSessionSchema's z.enum (src/lib/schemas/pickleball/sessions.ts) ever
// gains a value. Extracted to its own module (rather than left inline in
// SessionControlPage.jsx, where it originated) so SessionsListPage.jsx's
// create-form session-type selector can reuse it too -- exporting it
// straight from a page component trips eslint's react-refresh rule, which
// requires a component file to export components only.
export function humanizeEnum(value) {
  return value
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ')
}
