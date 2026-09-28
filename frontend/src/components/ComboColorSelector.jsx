import { ColorSwatch } from './ColorSwatch';
import './ComboColorSelector.css';

/**
 * Lets the customer pick exactly `requiredCount` colors from the active variants.
 * When allowDuplicateColors is true, the same color can be picked more than once
 * (each click adds one occurrence, shown as a count badge on the swatch).
 */
export function ComboColorSelector({ variants, requiredCount, allowDuplicateColors, selectedIds, onChange }) {
  const activeVariants = variants.filter((v) => v.isActive);

  const countOf = (id) => selectedIds.filter((s) => s === id).length;
  const isFull = selectedIds.length >= requiredCount;

  function handleSwatchClick(variantId) {
    const variant = activeVariants.find((v) => v.id === variantId);
    const alreadySelected = countOf(variantId) > 0;

    if (alreadySelected && !allowDuplicateColors) {
      onChange(selectedIds.filter((id) => id !== variantId));
      return;
    }

    if (variant?.inStock === false) return;
    if (isFull) return;
    onChange([...selectedIds, variantId]);
  }

  function removeAt(index) {
    onChange(selectedIds.filter((_, i) => i !== index));
  }

  return (
    <div className="combo-color-selector">
      <div className="combo-swatches">
        {activeVariants.map((variant) => {
          const count = countOf(variant.id);
          // Toggling off an already-selected color (no-duplicates case) must stay
          // enabled even when the selection is full, so the user can free a slot.
          const canToggleOff = !allowDuplicateColors && count > 0;
          const outOfStock = variant.inStock === false;
          const disabled = !canToggleOff && isFull;
          return (
            <ColorSwatch
              key={variant.id}
              colorCode={variant.colorCode}
              colorName={variant.colorName}
              selected={count > 0}
              count={count}
              disabled={disabled}
              outOfStock={outOfStock}
              onClick={() => handleSwatchClick(variant.id)}
            />
          );
        })}
      </div>

      <div className="combo-selection-summary">
        {requiredCount > 1 && (
          <span>
            {selectedIds.length} / {requiredCount} selected
          </span>
        )}
        {selectedIds.length > 0 && (
          <div className="combo-selected-chips">
            {selectedIds.map((id, index) => {
              const variant = activeVariants.find((v) => v.id === id);
              return (
                <button
                  key={`${id}-${index}`}
                  type="button"
                  className="combo-chip"
                  style={{ '--chip-color': variant?.colorCode }}
                  onClick={() => removeAt(index)}
                  title={`Remove ${variant?.colorName}`}
                >
                  {variant?.colorName} ×
                </button>
              );
            })}
          </div>
        )}
        {requiredCount > 1 && !allowDuplicateColors && (
          <p className="combo-hint">Duplicate colors are not allowed for this option.</p>
        )}
      </div>
    </div>
  );
}
