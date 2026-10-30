// The product page's "Proof Stats" block: pure helpers shared by the storefront component,
// the admin editor's live preview and its Save checks. The server enforces the same rules.

export const MAX_STATS = 6;
export const MAX_STATEMENT = 90;
export const MAX_HEADER = 120;
export const NEEDS_SOURCE = 'Percentages need a real source. Add your survey details.';
export const MIN_SAMPLE_SIZE = 30;
export const SAMPLE_TOO_SMALL = `At least ${MIN_SAMPLE_SIZE} survey responses are needed to show percentages.`;
// Colour themes of the block; the colours live in styles/theme.css (.proof-theme-<id>).
export const PROOF_THEMES = [
  { id: 'lavender', label: 'Lavender Light' },
  { id: 'plum', label: 'Plum Dark' },
  { id: 'blush', label: 'Blush' },
  { id: 'mono', label: 'Minimal Mono' },
];
export const PROOF_ICONS = ['feather', 'sparkles', 'heart', 'shield', 'leaf', 'wind', 'sun', 'smile', 'star', 'zap'];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTH_OPTIONS = MONTHS.map((name, i) => ({ value: String(i + 1).padStart(2, '0'), label: name }));

// "the *satvex* difference." -> [{ text: 'the ', em: false }, { text: 'satvex', em: true }, { text: ' difference.', em: false }]
// A lone * with no partner stays as plain text.
export function parseEmphasis(text) {
  const parts = [];
  const re = /\*([^*]+)\*/g;
  const source = String(text || '');
  let last = 0;
  let m;
  while ((m = re.exec(source))) {
    if (m.index > last) parts.push({ text: source.slice(last, m.index), em: false });
    parts.push({ text: m[1], em: true });
    last = m.index + m[0].length;
  }
  if (last < source.length) parts.push({ text: source.slice(last), em: false });
  return parts;
}

// "2027-01" -> "January 2027"
export function monthLabel(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(ym || '');
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return '';
  return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

export function footnoteFor(section) {
  const active = (section.stats || []).filter((s) => s.active !== false);
  if (section.sourceText?.trim()) return section.sourceText.trim();
  if (!active.some((s) => s.valueType === 'number')) return '';
  const when = monthLabel(section.surveyMonth);
  if (!section.sampleSize || !when) return '';
  return `Based on a survey of ${section.sampleSize} SATVEX customers, ${when}.`;
}

// The shopper-facing shape (what the API returns), built from the admin's draft for the preview.
export function previewSection(section) {
  const stats = (section.stats || []).filter((s) => s.active !== false);
  return {
    header: section.header || '',
    theme: PROOF_THEMES.some((t) => t.id === section.theme) ? section.theme : 'lavender',
    stats: stats.map((s, i) => ({ id: s.id || `preview_${i}`, valueType: s.valueType, value: s.value, suffix: s.suffix || '', statement: s.statement })),
    footnote: footnoteFor({ ...section, stats }),
  };
}

// Problems that block Save (empty object = fine). Keys: stats, source, and statRows[index].
export function checkProofSection(section) {
  const errors = {};
  if (!section) return errors;
  const stats = section.stats || [];
  const active = stats.filter((s) => s.active !== false);
  const rows = stats.map((s) => {
    if (s.active === false) return '';
    if (!String(s.statement || '').trim()) return 'Write the statement.';
    if (String(s.statement).length > MAX_STATEMENT) return `Keep the statement to ${MAX_STATEMENT} characters.`;
    if (s.valueType === 'number' && !/^\d+(\.\d+)?$/.test(String(s.value || '').trim())) return 'Enter a number, like 98.';
    if (s.valueType === 'text' && !String(s.value || '').trim()) return 'Enter the word to show, like FLEX.';
    if (s.valueType === 'icon' && !PROOF_ICONS.includes(s.value)) return 'Choose an icon.';
    return '';
  });
  if (rows.some(Boolean)) errors.statRows = rows;
  if (section.enabled && active.length === 0) errors.stats = 'Add at least one active stat box, or turn the section off.';
  if (active.some((s) => s.valueType === 'number')) {
    if (!section.sampleSize || !section.surveyMonth) errors.source = NEEDS_SOURCE;
    else if (Number(section.sampleSize) < MIN_SAMPLE_SIZE) errors.source = SAMPLE_TOO_SMALL;
  }
  return errors;
}

export const hasProofErrors = (errors) => Boolean(errors.stats || errors.source || errors.statRows);

export const EMPTY_PROOF_SECTION = {
  enabled: false,
  header: '',
  theme: 'lavender',
  stats: [],
  sourceText: '',
  sampleSize: '',
  surveyMonth: '',
};

// The brief's starter content for the Butterfly claw clip: text-only boxes, so no survey is needed.
export const STARTER_PROOF_SECTION = {
  ...EMPTY_PROOF_SECTION,
  header: 'the *satvex* difference.',
  stats: [
    { valueType: 'text', value: 'FLEX', suffix: '', statement: 'bends instead of *snapping*. lean back without worry.', active: true },
    { valueType: 'text', value: 'GRIP', suffix: '', statement: 'a strong spring that holds *thick & curly* hair in place.', active: true },
    { valueType: 'text', value: 'SOFT', suffix: '', statement: "rounded teeth that *don't dig* into your scalp.", active: true },
    { valueType: 'text', value: 'LIGHT', suffix: '', statement: "so light, you'll *forget* you're wearing it.", active: true },
  ],
};
