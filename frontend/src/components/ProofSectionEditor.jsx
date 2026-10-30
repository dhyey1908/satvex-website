import { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, GripVertical, Monitor, Plus, Smartphone, Sparkles, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import { ProofStats, Emphasis } from './ProofStats';
import { Switch } from './admin/Switch';
import {
  MAX_STATS,
  MAX_STATEMENT,
  MAX_HEADER,
  MIN_SAMPLE_SIZE,
  MONTH_OPTIONS,
  PROOF_THEMES,
  STARTER_PROOF_SECTION,
  previewSection,
} from '../utils/proofSection';
import './ProofSectionEditor.css';

let localCounter = 0;
const newStatId = () => `stat_local_${Date.now()}_${localCounter++}`;
const NEW_STAT = { valueType: 'number', value: '', suffix: '%', statement: '', active: true };

/**
 * Admin card "Proof Stats (above reviews)" for a product: on/off, stats title, colour theme,
 * 1-6 stat boxes (reorder by drag or arrows) and - only when a box shows a number - the survey
 * details it needs. `value` / `onChange` are the product form's own state - it saves with the
 * product's Save button. `errors` comes from checkProofSection() (shown inline; the form blocks
 * Save while there are any).
 */
export function ProofSectionEditor({ value, onChange, errors = {} }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState('desktop');
  const [dragFrom, setDragFrom] = useState(null);

  const stats = value.stats || [];
  const hasNumber = stats.some((s) => s.active !== false && s.valueType === 'number');
  const thisYear = new Date().getFullYear();
  const [surveyYear = '', surveyMonthNo = ''] = (value.surveyMonth || '').split('-');
  const years = [thisYear + 1, thisYear, thisYear - 1, thisYear - 2, thisYear - 3];
  const theme = value.theme || 'lavender';

  const set = (patch) => onChange({ ...value, ...patch });
  const patchStat = (index, patch) => set({ stats: stats.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  const removeStat = (index) => set({ stats: stats.filter((_, i) => i !== index) });
  function moveStat(from, to) {
    if (from === to || to < 0 || to >= stats.length) return;
    const next = [...stats];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    set({ stats: next });
  }
  function setSurvey(year, month) {
    set({ surveyMonth: year && month ? `${year}-${month}` : year || month ? `${year || thisYear}-${month || '01'}` : '' });
  }
  function useStarter() {
    set({ ...STARTER_PROOF_SECTION, enabled: value.enabled, theme, stats: STARTER_PROOF_SECTION.stats.map((s) => ({ ...s, id: newStatId() })) });
  }

  return (
    <div className="admin-form-section pse">
      <div className="pse-head">
        <h3>Proof Stats (above reviews)</h3>
        <Switch checked={Boolean(value.enabled)} onChange={(on) => set({ enabled: on })} label="Show on the product page" />
      </div>
      <p className="field-hint">
        Text and percentage boxes shown on the product page just <strong>above the Reviews</strong>. Off by default. Stays hidden until it has at least one active box.
        (The headline strip above the photos is a different card: Top Highlight.)
      </p>
      {errors.stats && <p className="field-error" role="alert">{errors.stats}</p>}

      <div className="field">
        <label htmlFor="pse-header">Stats title</label>
        <input id="pse-header" maxLength={MAX_HEADER} value={value.header || ''} onChange={(e) => set({ header: e.target.value })} placeholder="tested on real hair. *loved* daily." />
        <p className="field-hint">Put *asterisks* around words to emphasise them, like *loved*. {(value.header || '').length}/{MAX_HEADER}</p>
        {value.header && (
          <p className="pse-header-preview" aria-label="Title preview">
            <Emphasis text={value.header} />
          </p>
        )}
      </div>

      <div className="field pse-theme">
        <label htmlFor="pse-theme">Theme</label>
        <div className="pse-theme-row">
          <select id="pse-theme" value={theme} onChange={(e) => set({ theme: e.target.value })}>
            {PROOF_THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <span className={`pse-swatch proof-theme-${theme}`} aria-hidden="true">
            <span className="pse-swatch-box">
              <b>98%</b>
              <i>text</i>
            </span>
          </span>
        </div>
      </div>

      <div className="pse-stats-head">
        <span className="pse-label">Stat boxes ({stats.length}/{MAX_STATS})</span>
        {stats.length === 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={useStarter}>
            <Sparkles size={14} /> Use the SATVEX starter content
          </button>
        )}
      </div>
      <ul className="pse-stats">
        {stats.map((stat, i) => (
          <li
            key={stat.id || i}
            className={`pse-stat ${dragFrom === i ? 'is-dragging' : ''} ${stat.active === false ? 'is-off' : ''}`}
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => dragFrom !== null && e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom !== null) moveStat(dragFrom, i);
              setDragFrom(null);
            }}
            onDragEnd={() => setDragFrom(null)}
          >
            <div className="pse-stat-bar">
              <GripVertical size={16} aria-hidden="true" className="pse-grip" />
              <strong>Box {i + 1}</strong>
              <Switch checked={stat.active !== false} onChange={(on) => patchStat(i, { active: on })} label="Active" />
              <span className="pse-spacer" />
              <button type="button" className="ui-icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => moveStat(i, i - 1)}><ArrowUp size={15} /></button>
              <button type="button" className="ui-icon-btn" aria-label="Move down" disabled={i === stats.length - 1} onClick={() => moveStat(i, i + 1)}><ArrowDown size={15} /></button>
              <button type="button" className="ui-icon-btn" aria-label={`Remove box ${i + 1}`} onClick={() => removeStat(i)}><Trash2 size={15} /></button>
            </div>
            <div className="pse-stat-fields">
              <div className="field">
                <label htmlFor={`pse-type-${i}`}>Value type</label>
                <select id={`pse-type-${i}`} value={stat.valueType} onChange={(e) => patchStat(i, { valueType: e.target.value, value: '', suffix: e.target.value === 'number' ? '%' : '' })}>
                  <option value="number">Number (like 98%)</option>
                  <option value="text">Text (like FLEX)</option>
                  {stat.valueType === 'icon' && <option value="icon">Icon (older box)</option>}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`pse-value-${i}`}>Value</label>
                <input
                  id={`pse-value-${i}`}
                  value={stat.value}
                  maxLength={stat.valueType === 'number' ? 8 : 12}
                  inputMode={stat.valueType === 'number' ? 'decimal' : undefined}
                  placeholder={stat.valueType === 'number' ? '98' : 'FLEX'}
                  onChange={(e) => patchStat(i, { value: stat.valueType === 'number' ? e.target.value.replace(/[^0-9.]/g, '') : e.target.value.toUpperCase() })}
                />
              </div>
              {stat.valueType === 'number' && (
                <div className="field pse-suffix">
                  <label htmlFor={`pse-suffix-${i}`}>Suffix</label>
                  <input id={`pse-suffix-${i}`} value={stat.suffix} maxLength={4} placeholder="%" onChange={(e) => patchStat(i, { suffix: e.target.value })} />
                </div>
              )}
            </div>
            <div className="field">
              <label htmlFor={`pse-statement-${i}`}>Statement</label>
              <textarea
                id={`pse-statement-${i}`}
                rows={2}
                maxLength={MAX_STATEMENT}
                value={stat.statement}
                placeholder="bends instead of *snapping*. lean back without worry."
                onChange={(e) => patchStat(i, { statement: e.target.value })}
              />
              <p className="field-hint pse-counter">*asterisks* make a word bold · {stat.statement.length}/{MAX_STATEMENT}</p>
            </div>
            {errors.statRows?.[i] && <p className="field-error" role="alert">{errors.statRows[i]}</p>}
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-ghost btn-sm" disabled={stats.length >= MAX_STATS} onClick={() => set({ stats: [...stats, { ...NEW_STAT, id: newStatId() }] })}>
        <Plus size={14} /> Add a stat box
      </button>

      {hasNumber && (
        <div className={`pse-source ${errors.source ? 'invalid' : ''}`}>
          <span className="pse-label">Source of the numbers <b aria-hidden="true">*</b></span>
          <p className="field-hint">
            A number box is a claim about real customers, so it needs the survey behind it. At least {MIN_SAMPLE_SIZE} survey responses are needed to show percentages.
          </p>
          <div className="pse-source-grid">
            <div className="field">
              <label htmlFor="pse-sample">Sample size (people) <b aria-hidden="true">*</b></label>
              <input id="pse-sample" type="number" min={MIN_SAMPLE_SIZE} step="1" value={value.sampleSize ?? ''} onChange={(e) => set({ sampleSize: e.target.value })} placeholder="120" />
            </div>
            <div className="field">
              <label htmlFor="pse-month">Survey month <b aria-hidden="true">*</b></label>
              <div className="pse-month">
                <select id="pse-month" aria-label="Survey month" value={surveyMonthNo} onChange={(e) => setSurvey(surveyYear, e.target.value)}>
                  <option value="">Month</option>
                  {MONTH_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <select aria-label="Survey year" value={surveyYear} onChange={(e) => setSurvey(e.target.value, surveyMonthNo)}>
                  <option value="">Year</option>
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="field">
            <label htmlFor="pse-source">Footnote text (optional)</label>
            <input id="pse-source" maxLength={200} value={value.sourceText || ''} onChange={(e) => set({ sourceText: e.target.value })} placeholder="Leave blank to use: Based on a survey of 120 SATVEX customers, January 2027." />
          </div>
          {errors.source && <p className="field-error" role="alert">{errors.source}</p>}
        </div>
      )}

      <button type="button" className="btn btn-outline" onClick={() => setPreviewOpen(true)} disabled={stats.filter((s) => s.active !== false).length === 0}>
        <Eye size={16} /> Preview
      </button>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Proof Stats preview">
        <div className="pse-preview-tabs" role="group" aria-label="Preview size">
          <button type="button" className={`btn btn-sm ${previewMode === 'desktop' ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={previewMode === 'desktop'} onClick={() => setPreviewMode('desktop')}>
            <Monitor size={14} /> Desktop
          </button>
          <button type="button" className={`btn btn-sm ${previewMode === 'mobile' ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={previewMode === 'mobile'} onClick={() => setPreviewMode('mobile')}>
            <Smartphone size={14} /> Mobile
          </button>
        </div>
        <div className={`pse-preview-frame is-${previewMode}`}>
          <ProofStats section={previewSection(value)} preview />
        </div>
        {!value.enabled && <p className="field-hint">The section is switched off, so shoppers don't see it yet.</p>}
      </Modal>
    </div>
  );
}
