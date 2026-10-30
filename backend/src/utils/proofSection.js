// Display side of the product page's "Proof Stats" block (see proofSectionValidators).

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "2027-01" -> "January 2027"
function monthLabel(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(ym || '');
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return '';
  return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

// Small grey line under the boxes. Whenever a box shows a number it is required:
// the admin's own source text, else "Based on a survey of 120 SATVEX customers, January 2027."
function footnote(section) {
  const hasNumber = (section.stats || []).some((s) => s.active !== false && s.valueType === 'number');
  if (section.sourceText) return section.sourceText;
  if (!hasNumber) return '';
  const when = monthLabel(section.surveyMonth);
  if (!section.sampleSize || !when) return '';
  return `Based on a survey of ${section.sampleSize} SATVEX customers, ${when}.`;
}

// What shoppers get: nothing unless the section is on and has at least one active box;
// otherwise only the active boxes, with the footnote worked out here.
function publicProofSection(section) {
  if (!section || section.enabled !== true) return null;
  const stats = (section.stats || []).filter((s) => s.active !== false);
  if (stats.length === 0) return null;
  return {
    header: section.header || '',
    theme: ['lavender', 'plum', 'blush', 'mono'].includes(section.theme) ? section.theme : 'lavender',
    stats: stats.map(({ id, valueType, value, suffix, statement }) => ({ id, valueType, value, suffix: suffix || '', statement })),
    footnote: footnote({ ...section, stats }),
  };
}

// The starter content from the brief (Butterfly claw clip). Text-only, so no survey is needed.
const STARTER_PROOF_SECTION = {
  enabled: false,
  header: 'the *satvex* difference.',
  theme: 'lavender',
  stats: [
    { valueType: 'text', value: 'FLEX', suffix: '', statement: 'bends instead of *snapping*. lean back without worry.', active: true },
    { valueType: 'text', value: 'GRIP', suffix: '', statement: 'a strong spring that holds *thick & curly* hair in place.', active: true },
    { valueType: 'text', value: 'SOFT', suffix: '', statement: "rounded teeth that *don't dig* into your scalp.", active: true },
    { valueType: 'text', value: 'LIGHT', suffix: '', statement: "so light, you'll *forget* you're wearing it.", active: true },
  ],
  sourceText: '',
  sampleSize: null,
  surveyMonth: '',
};

module.exports = { monthLabel, footnote, publicProofSection, STARTER_PROOF_SECTION };
