import './ColorSwatch.css';

export function ColorSwatch({ colorCode, colorName, selected, disabled, count, onClick }) {
  return (
    <button
      type="button"
      className={`color-swatch ${selected ? 'selected' : ''}`}
      style={{ '--swatch-color': colorCode }}
      title={colorName}
      aria-label={colorName}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
    >
      {count > 1 && <span className="swatch-count">{count}</span>}
    </button>
  );
}
