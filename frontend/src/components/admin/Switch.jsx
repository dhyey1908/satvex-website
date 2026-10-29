import './ui.css';

/** An on/off toggle (a real checkbox underneath, so keyboard and screen readers work). */
export function Switch({ checked, onChange, label, disabled = false }) {
  return (
    <label className={`ui-switch ${disabled ? 'is-disabled' : ''}`}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="ui-switch-track" aria-hidden="true" />
      {label && <span className="ui-switch-label">{label}</span>}
    </label>
  );
}
