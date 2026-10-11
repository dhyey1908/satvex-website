function pad(n) {
  return String(n).padStart(2, '0');
}

// DD/MM/YYYY everywhere in the app — never the browser's locale-default
// (which renders MM/DD/YYYY for en-US and is ambiguous/wrong for an
// India-based store).
export function formatDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// DD/MM/YYYY, HH:mm (24-hour) — for timestamps that also need a time.
export function formatDateTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${formatDate(d)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
