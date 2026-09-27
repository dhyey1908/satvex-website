/**
 * Turns an ApiError's backend `details` (Zod issues: [{ path, message }])
 * into a { fieldName: message } map for a form's fieldErrors state, so a
 * server-side validation failure lands on the right input instead of only
 * showing a generic "Invalid request data" banner.
 *
 * `fieldMap` optionally renames a backend path to the form's own field name
 * when they differ (e.g. backend `newPassword` vs a form's `password`).
 */
export function mapServerFieldErrors(err, fieldMap = {}) {
  if (!err?.details || !Array.isArray(err.details) || err.details.length === 0) return null;
  const mapped = {};
  for (const issue of err.details) {
    const path = issue.path || issue.field;
    if (!path) continue;
    const field = fieldMap[path] || path;
    mapped[field] = issue.message;
  }
  return Object.keys(mapped).length > 0 ? mapped : null;
}
