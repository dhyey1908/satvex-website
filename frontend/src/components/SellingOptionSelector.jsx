import { Check } from 'lucide-react';
import './SellingOptionSelector.css';

export function SellingOptionSelector({ options, selectedId, onSelect }) {
  const active = options.filter((o) => o.isActive);
  const singleOption = active.find((o) => o.quantity === 1);

  return (
    <div className="selling-option-selector">
      {active.map((option) => {
        // "Save ₹X" compares a combo's price against buying that many single
        // pieces separately — purely a display calculation, doesn't touch
        // the actual price used anywhere (that still comes from `option`).
        const singleEquivalent = singleOption && option.quantity > 1 ? singleOption.price * option.quantity : null;
        const savings = singleEquivalent && singleEquivalent > option.price ? singleEquivalent - option.price : 0;

        return (
          <button
            key={option.id}
            type="button"
            className={`selling-option ${selectedId === option.id ? 'selected' : ''}`}
            onClick={() => onSelect(option)}
          >
            {selectedId === option.id && (
              <span className="selling-option-check">
                <Check size={11} strokeWidth={3} />
              </span>
            )}
            <span className="selling-option-name">{option.name}</span>
            <span className="selling-option-price">₹{option.price}</span>
            {savings > 0 && <span className="selling-option-savings">Save ₹{savings}</span>}
          </button>
        );
      })}
    </div>
  );
}
