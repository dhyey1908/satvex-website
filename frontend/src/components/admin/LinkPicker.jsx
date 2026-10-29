import { useEffect, useState } from 'react';
import { PAGE_LINKS, linkProblem, pickerValue } from '../../utils/linkTargets';
import './ui.css';

/** Dropdown of Shop / About / Contact / each product, plus "Custom URL". Checks the address as you type. */
export function LinkPicker({ id, value, onChange, products }) {
  const [custom, setCustom] = useState(() => pickerValue(value, products) === 'custom');
  const selected = custom ? 'custom' : pickerValue(value, products);
  // Products load after the card does: a stored product link may turn out to be a known one.
  useEffect(() => {
    if (pickerValue(value, products) !== 'custom') setCustom(false);
  }, [value, products]);
  const problem = linkProblem(value, products);

  return (
    <div className="ui-link-picker">
      <select
        id={id}
        value={selected}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'custom') setCustom(true);
          else {
            setCustom(false);
            onChange(v);
          }
        }}
      >
        <option value="">No link</option>
        {PAGE_LINKS.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
        {products?.length > 0 && (
          <optgroup label="Products">
            {products.map((p) => (
              <option key={p.slug} value={`/product/${p.slug}`}>{p.name}</option>
            ))}
          </optgroup>
        )}
        <option value="custom">Custom URL…</option>
      </select>
      {selected === 'custom' && (
        <input type="text" value={value || ''} placeholder="/shop or https://…" aria-label="Custom link" aria-invalid={Boolean(problem)} onChange={(e) => onChange(e.target.value)} />
      )}
      {problem && <span className="ui-error" role="alert">{problem}</span>}
    </div>
  );
}
