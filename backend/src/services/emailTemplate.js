// One branded layout for every email the store sends, so each message looks
// like it comes from Satvex and can be read at a glance: a coloured status
// banner, a short "at a glance" table, the customer's message or the error in
// its own box, numbered next steps, and one obvious button.
//
// Email clients ignore stylesheets and CSS variables, so this is table-based
// markup with inline styles; the colours below are the Lavender & Lilac theme
// values (frontend/src/styles/theme.css) copied in on purpose.

const C = {
  bg: '#faf7fd',
  surface: '#ffffff',
  alt: '#f4eefa',
  border: '#e0d2ee',
  primary: '#6b4fa0',
  primaryDark: '#4f3680',
  soft: '#e6daf4',
  text: '#2e2338',
  muted: '#66596f',
  error: '#b3261e',
  errorBg: '#fbe5e3',
  warn: '#8a5a12',
  warnBg: '#fbf0da',
  success: '#2f6b48',
  successBg: '#e6f2ea',
};

const TONES = {
  info: { fg: C.primaryDark, bg: C.soft },
  urgent: { fg: C.error, bg: C.errorBg },
  warn: { fg: C.warn, bg: C.warnBg },
  success: { fg: C.success, bg: C.successBg },
};

const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// Every dynamic value is escaped: customer-typed text (a name, a message) must
// never be able to inject markup into an email an admin opens.
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const multiline = (value) => esc(value).replace(/\r?\n/g, '<br>');

// Only http(s) links are ever rendered as links.
const safeUrl = (url) => (/^https?:\/\//i.test(String(url)) ? String(url) : null);

function formatWhen(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} IST`;
}

function badge({ label, tone = 'info' }) {
  const t = TONES[tone] || TONES.info;
  return `<span style="display:inline-block;padding:6px 14px;border-radius:999px;background:${t.bg};color:${t.fg};font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">${esc(label)}</span>`;
}

function rowsTable(rows) {
  const body = rows
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([label, value, link], i) => {
      const shown = link && safeUrl(link) || (link && /^(mailto|tel):/i.test(link))
        ? `<a href="${esc(link)}" style="color:${C.primary};font-weight:600;text-decoration:underline;">${esc(value)}</a>`
        : multiline(value);
      return `<tr style="background:${i % 2 ? C.surface : C.bg};">
        <td style="padding:10px 14px;width:36%;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${C.muted};vertical-align:top;">${esc(label)}</td>
        <td style="padding:10px 14px;font-size:15px;color:${C.text};vertical-align:top;word-break:break-word;">${shown}</td>
      </tr>`;
    })
    .join('');
  if (!body) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.border};border-radius:10px;border-collapse:separate;overflow:hidden;margin:0 0 20px;">${body}</table>`;
}

function quoteBlock({ label, text }) {
  return `<p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${C.muted};">${esc(label)}</p>
  <div style="margin:0 0 20px;padding:14px 16px;background:${C.alt};border-left:4px solid ${C.primary};border-radius:6px;font-size:15px;line-height:1.6;color:${C.text};">${multiline(text)}</div>`;
}

function codeBlock({ label, text }) {
  return `<p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${C.muted};">${esc(label)}</p>
  <div style="margin:0 0 20px;padding:12px 14px;background:${C.errorBg};border-radius:6px;font-family:Consolas,Menlo,monospace;font-size:13px;line-height:1.5;color:${C.error};word-break:break-word;">${multiline(text)}</div>`;
}

// columns: ['Item','Qty','Price']; rows: [[...]]; footRows: [[label, value]] right-aligned totals.
function dataTable({ label, columns, rows, footRows = [] }) {
  const head = columns
    .map((c, i) => `<th align="${i === columns.length - 1 ? 'right' : 'left'}" style="padding:8px 14px;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${C.muted};background:${C.alt};">${esc(c)}</th>`)
    .join('');
  const body = rows
    .map(
      (r) => `<tr>${r
        .map((cell, i) => `<td align="${i === r.length - 1 ? 'right' : 'left'}" style="padding:10px 14px;font-size:14px;line-height:1.45;color:${C.text};border-top:1px solid ${C.border};vertical-align:top;">${multiline(cell)}</td>`)
        .join('')}</tr>`
    )
    .join('');
  const foot = footRows
    .map(
      ([l, v, strong]) => `<tr><td colspan="${columns.length - 1}" align="right" style="padding:6px 14px;font-size:${strong ? 15 : 13}px;font-weight:${strong ? 700 : 400};color:${strong ? C.text : C.muted};border-top:${strong ? `2px solid ${C.border}` : 'none'};">${esc(l)}</td><td align="right" style="padding:6px 14px;font-size:${strong ? 16 : 13}px;font-weight:${strong ? 700 : 400};color:${C.text};white-space:nowrap;border-top:${strong ? `2px solid ${C.border}` : 'none'};">${esc(v)}</td></tr>`
    )
    .join('');
  return `${label ? `<p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${C.muted};">${esc(label)}</p>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.border};border-radius:10px;border-collapse:separate;overflow:hidden;margin:0 0 20px;"><tr>${head}</tr>${body}${foot}</table>`;
}

function stepsList(steps) {
  const items = steps
    .map(
      (s, i) => `<tr><td style="width:30px;padding:6px 0;vertical-align:top;"><span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:${C.primary};color:#ffffff;font-size:12px;font-weight:700;line-height:22px;text-align:center;">${i + 1}</span></td><td style="padding:6px 0;font-size:15px;line-height:1.5;color:${C.text};">${esc(s)}</td></tr>`
    )
    .join('');
  return `<p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${C.muted};">What to do next</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">${items}</table>`;
}

function button({ label, url }) {
  const href = safeUrl(url);
  if (!href) return '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px;"><tr><td style="border-radius:8px;background:${C.primary};">
    <a href="${esc(href)}" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#ffffff;text-decoration:none;">${esc(label)}</a>
  </td></tr></table>`;
}

function linkList(links) {
  const items = links
    .map((l) => ({ ...l, href: safeUrl(l.url) }))
    .filter((l) => l.href)
    .map((l) => `<li style="margin:0 0 6px;"><a href="${esc(l.href)}" style="color:${C.primary};font-weight:600;">${esc(l.label)}</a></li>`)
    .join('');
  if (!items) return '';
  return `<p style="margin:16px 0 6px;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${C.muted};">Attachments</p>
  <ul style="margin:0 0 16px;padding-left:18px;font-size:14px;">${items}</ul>`;
}

/**
 * @param {object} o
 * @param {string} o.preheader   short line shown next to the subject in the inbox
 * @param {string} o.audience    small label in the header, e.g. "Admin alert"
 * @param {{label:string,tone?:string}} [o.status]  coloured banner
 * @param {string} o.title
 * @param {string} [o.intro]
 * @param {Array} [o.rows]       [label, value, optionalLink]
 * @param {{label:string,text:string}} [o.quote]    the customer's message
 * @param {{label:string,text:string}} [o.code]     an error message
 * @param {string[]} [o.steps]
 * @param {{label:string,url:string}} [o.button]
 * @param {Array} [o.links]      [{label,url}] attachments
 * @param {string} [o.note]      muted line under the button
 * @param {string} [o.siteUrl]
 * @returns {{ html: string, text: string }}
 */
function renderEmail(o) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.title)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${FONT};color:${C.text};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(o.preheader || '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
    <tr><td style="background:${C.primary};border-radius:12px 12px 0 0;padding:20px 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-family:Georgia,'Times New Roman',serif;font-size:24px;letter-spacing:.32em;color:#ffffff;">SATVEX</td>
        <td align="right" style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${C.soft};">${esc(o.audience || '')}</td>
      </tr></table>
    </td></tr>
    <tr><td style="background:${C.surface};border:1px solid ${C.border};border-top:none;border-radius:0 0 12px 12px;padding:28px;">
      ${o.status ? `<div style="margin:0 0 14px;">${badge(o.status)}</div>` : ''}
      <h1 style="margin:0 0 10px;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;font-weight:400;color:${C.text};">${esc(o.title)}</h1>
      ${o.intro ? `<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:${C.muted};">${esc(o.intro)}</p>` : ''}
      ${o.rows ? rowsTable(o.rows) : ''}
      ${o.table ? dataTable(o.table) : ''}
      ${o.quote ? quoteBlock(o.quote) : ''}
      ${o.code ? codeBlock(o.code) : ''}
      ${o.links ? linkList(o.links) : ''}
      ${o.steps ? stepsList(o.steps) : ''}
      ${o.button ? button(o.button) : ''}
      ${o.note ? `<p style="margin:14px 0 0;font-size:13px;line-height:1.5;color:${C.muted};">${esc(o.note)}</p>` : ''}
    </td></tr>
    <tr><td align="center" style="padding:16px 8px;font-size:12px;line-height:1.5;color:${C.muted};">
      Sent automatically by the Satvex store${o.siteUrl ? ` · <a href="${esc(o.siteUrl)}" style="color:${C.muted};">${esc(o.siteUrl.replace(/^https?:\/\//, ''))}</a>` : ''}
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const lines = [
    o.status ? `[${o.status.label.toUpperCase()}]` : null,
    o.title,
    '',
    o.intro || null,
    o.intro ? '' : null,
    ...(o.rows || []).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([l, v]) => `${l}: ${v}`),
    o.rows ? '' : null,
    o.table ? `${o.table.label || 'Details'}:\n${o.table.rows.map((r) => `- ${r.join(' | ')}`).join('\n')}\n${(o.table.footRows || []).map(([l, v]) => `${l}: ${v}`).join('\n')}\n` : null,
    o.quote ? `${o.quote.label}:\n${o.quote.text}\n` : null,
    o.code ? `${o.code.label}:\n${o.code.text}\n` : null,
    o.links?.length ? `Attachments:\n${o.links.map((l) => `- ${l.label}: ${l.url}`).join('\n')}\n` : null,
    o.steps ? `What to do next:\n${o.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n` : null,
    o.button ? `${o.button.label}: ${o.button.url}` : null,
    o.note || null,
  ].filter((l) => l !== null);

  return { html, text: lines.join('\n') };
}

module.exports = { renderEmail, esc, formatWhen };
