import { Check, Gift } from 'lucide-react';
import { PriceDisplay } from './PriceDisplay';
import { STOREFRONT } from '../config/storefront';
import { packBadge } from '../utils/packBadge';
import './SellingOptionSelector.css';

export function SellingOptionSelector({ options, selectedId, onSelect }) {
  const active = options.filter((o) => o.isActive);

  return (
    <div className="selling-option-selector" data-count={active.length}>
      {active.map((option) => {
        const badge = packBadge(option, STOREFRONT);
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selectedId === option.id}
            className={`selling-option ${option.quantity > 1 ? 'selling-option-combo' : ''} ${selectedId === option.id ? 'selected' : ''}`}
            onClick={() => onSelect(option)}
          >
            {badge && <span className="selling-option-badge">{badge}</span>}
            {selectedId === option.id && (
              <span className="selling-option-check">
                <Check size={11} strokeWidth={3} />
              </span>
            )}
            <span className="selling-option-name">{option.name}</span>
            {option.offer?.freeLabel && (
              <>
                <span className="selling-option-free">
                  <Gift size={13} aria-hidden="true" /> {option.offer.freeLabel}
                  {/* a little burst of sparkles each time this pack is picked */}
                  {selectedId === option.id && (
                    <span className="free-burst" aria-hidden="true">
                      {[0, 1, 2, 3, 4, 5].map((n) => <i key={n} style={{ '--a': `${n * 60}deg` }} />)}
                    </span>
                  )}
                </span>
                <span className="selling-option-pieces">{option.quantity} pieces in the pack</span>
              </>
            )}
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
