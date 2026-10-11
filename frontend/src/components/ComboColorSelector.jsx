import { Eye, X } from 'lucide-react';
import { ColorSwatch } from './ColorSwatch';
import './ComboColorSelector.css';

/**
 * The single color-selection control for a product's selling option — lets
 * the customer pick exactly `requiredCount` colors from the active
 * variants, by clicking swatches (clicking an already-selected one toggles
 * it off, unless allowDuplicateColors is true, in which case each click
 * adds one more occurrence shown as a count badge). For a combo
 * (requiredCount > 1), the chips below double as a live main-image preview
 * switcher: clicking a chip shows that color on the main product image
 * without changing the selection itself, and `previewId` marks which one
 * is currently showing.
 */
export function ComboColorSelector({
  variants,
  requiredCount,
  allowDuplicateColors,
  selectedIds,
  onChange,
  previewId,
  onPreview,
}) {
  const activeVariants = variants.filter((v) => v.isActive);
  const isCombo = requiredCount > 1;

  const countOf = (id) => selectedIds.filter((s) => s === id).length;
  const isFull = selectedIds.length >= requiredCount;
  const remaining = requiredCount - selectedIds.length;

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
              showLabel
              onClick={() => handleSwatchClick(variant.id)}
            />
          );
        })}
      </div>

      <div className="combo-selection-summary">
        {isCombo && (
          <span className={`combo-count-badge ${remaining > 0 ? 'incomplete' : 'complete'}`}>
            {selectedIds.length} / {requiredCount} selected
          </span>
        )}

        {selectedIds.length > 0 && (
          <div className="combo-selected-chips">
            {selectedIds.map((id, index) => {
              const variant = activeVariants.find((v) => v.id === id);
              const isPreviewing = isCombo && previewId === id;
              return (
                <div
                  key={`${id}-${index}`}
                  className={`combo-chip ${isPreviewing ? 'previewing' : ''}`}
                  style={{ '--chip-color': variant?.colorCode }}
                >
                  {isCombo ? (
                    <button
                      type="button"
                      className="combo-chip-preview"
                      onClick={() => onPreview?.(id)}
                      title={`Preview ${variant?.colorName} on the main image`}
                    >
                      {isPreviewing && <Eye size={11} />}
                      {variant?.colorName}
                    </button>
                  ) : (
                    <span className="combo-chip-preview combo-chip-static">{variant?.colorName}</span>
                  )}
                  <button
                    type="button"
                    className="combo-chip-remove"
                    onClick={() => removeAt(index)}
                    aria-label={`Remove ${variant?.colorName}`}
                  >
                    <X size={11} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {isCombo && remaining > 0 && (
          <p className="combo-hint combo-hint-required">
            Select {remaining} more color{remaining > 1 ? 's' : ''} to continue.
          </p>
        )}
        {isCombo && !allowDuplicateColors && (
          <p className="combo-hint">Duplicate colors are not allowed for this option.</p>
        )}
      </div>
    </div>
  );
}
