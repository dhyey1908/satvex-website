import { Check } from 'lucide-react';
import { PriceDisplay } from './PriceDisplay';
import { STOREFRONT } from '../config/storefront';
import './SellingOptionSelector.css';

export function SellingOptionSelector({ options, selectedId, onSelect }) {
  const active = options.filter((o) => o.isActive);

  return (
    <div className="selling-option-selector">
      {active.map((option) => {
        const featured = STOREFRONT.featuredOptionId === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selectedId === option.id}
            className={`selling-option ${option.quantity > 1 ? 'selling-option-combo' : ''} ${selectedId === option.id ? 'selected' : ''}`}
            onClick={() => onSelect(option)}
          >
            {featured && <span className="selling-option-badge">{STOREFRONT.featuredOptionLabel}</span>}
            {selectedId === option.id && (
              <span className="selling-option-check">
                <Check size={11} strokeWidth={3} />
              </span>
            )}
            <span className="selling-option-name">{option.name}</span>
            <PriceDisplay
              price={option.price}
              compareAtPrice={option.compareAtPrice}
              offer={option.offer}
              showPerPiece={option.quantity > 1}
            />
          </button>
        );
      })}
    </div>
  );
}
