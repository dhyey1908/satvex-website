import './QuantitySelector.css';

export function QuantitySelector({ value, onChange, min = 1, max = 20, label = 'quantity' }) {
  return (
    <div className="quantity-selector">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-disabled={value <= min}
        aria-label={`Decrease ${label}`}
      >
        −
      </button>
      <span aria-live="polite">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-disabled={value >= max}
        aria-label={`Increase ${label}`}
      >
        +
      </button>
    </div>
  );
}
