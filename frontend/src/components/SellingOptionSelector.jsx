import './SellingOptionSelector.css';

export function SellingOptionSelector({ options, selectedId, onSelect }) {
  return (
    <div className="selling-option-selector">
      {options
        .filter((o) => o.isActive)
        .map((option) => (
          <button
            key={option.id}
            type="button"
            className={`selling-option ${selectedId === option.id ? 'selected' : ''}`}
            onClick={() => onSelect(option)}
          >
            <span className="selling-option-name">{option.name}</span>
            <span className="selling-option-price">₹{option.price}</span>
          </button>
        ))}
    </div>
  );
}
