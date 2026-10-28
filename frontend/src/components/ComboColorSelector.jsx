import { Minus } from 'lucide-react';
import './ComboColorSelector.css';

/**
 * The colour-selection control for a selling option: a grid of circular
 * swatches showing every active colour at once (no inner scroll box).
 * `selectedIds` is a flat array with one entry per selected unit (e.g.
 * ['var_1','var_1','var_2'] = 2x var_1 + 1x var_2) — a swatch's quantity badge
 * is just how many times its id appears. A colour can be picked more than once
 * only when allowDuplicateColors is true, the total can never exceed
 * requiredCount (the combo size), and an out-of-stock colour can never be
 * selected. For a single-piece option, tapping another colour swaps the pick.
 *
 * `onBlocked(message)` is called when a tap can't change the selection (combo
 * already full, colour already used once) so the page can explain why inline.
 */
export function ComboColorSelector({ variants, requiredCount, allowDuplicateColors, selectedIds, onChange, onBlocked }) {
  const activeVariants = variants.filter((v) => v.isActive);
  const perRowMax = allowDuplicateColors ? requiredCount : 1;
  const totalSelected = selectedIds.length;

  const countOf = (id) => selectedIds.filter((s) => s === id).length;

  function add(variant) {
    if (variant.inStock === false) return;
    if (requiredCount === 1) {
      onChange([variant.id]);
      return;
    }
    if (countOf(variant.id) >= perRowMax) {
      onBlocked?.(`${variant.colorName} is already selected — pick a different colour.`);
      return;
    }
    if (totalSelected >= requiredCount) {
      onBlocked?.(`You've chosen all ${requiredCount} colours — remove one to change your selection.`);
      return;
    }
    onChange([...selectedIds, variant.id]);
  }

  function remove(variant) {
    const idx = selectedIds.lastIndexOf(variant.id);
    if (idx === -1) return;
    const next = [...selectedIds];
    next.splice(idx, 1);
    onChange(next);
  }

  return (
    <div className="combo-color-selector">
      <div className="swatch-grid" role="group" aria-label="Colours">
        {activeVariants.map((variant) => {
          const count = countOf(variant.id);
          const outOfStock = variant.inStock === false;
          const selected = count > 0;
          return (
            <div key={variant.id} className={`swatch-cell ${outOfStock ? 'out-of-stock' : ''} ${selected && !outOfStock ? 'selected' : ''}`}>
              <div className="swatch-wrap">
                <button
                  type="button"
                  className={`swatch-btn ${selected ? 'selected' : ''}`}
                  style={{ '--swatch-color': variant.colorCode }}
                  onClick={() => add(variant)}
                  disabled={outOfStock}
                  aria-pressed={selected}
                  aria-label={
                    outOfStock
                      ? `${variant.colorName}, out of stock`
                      : `${variant.colorName}${selected ? `, ${count} selected` : ''}`
                  }
                >
                  {count > 0 && requiredCount > 1 && <span className="swatch-qty">{count}</span>}
                </button>
                {selected && requiredCount > 1 && (
                  <button
                    type="button"
                    className="swatch-remove"
                    onClick={() => remove(variant)}
                    aria-label={`Remove one ${variant.colorName}`}
                  >
                    <Minus size={12} strokeWidth={3} />
                  </button>
                )}
              </div>
              <span className="swatch-name">{variant.colorName}</span>
              {outOfStock && <span className="swatch-oos">Out of stock</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
