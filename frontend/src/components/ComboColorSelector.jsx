import { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import './ComboColorSelector.css';

/**
 * The single color-selection control for a product's selling option — a
 * compact, scrollable list of rows (swatch + name + minus/qty/plus), one
 * per active variant. `selectedIds` is a flat array with one entry per
 * selected unit (e.g. ['var_1','var_1','var_2'] = 2x var_1 + 1x var_2) —
 * each row's own count is just how many times its id appears in it. A row
 * can go above 1 only when allowDuplicateColors is true; the running total
 * across all rows can never exceed requiredCount (the combo limit) or an
 * out-of-stock variant.
 */
export function ComboColorSelector({ variants, requiredCount, allowDuplicateColors, selectedIds, onChange }) {
  const activeVariants = variants.filter((v) => v.isActive);
  const isCombo = requiredCount > 1;
  const perRowMax = allowDuplicateColors ? requiredCount : 1;
  const totalSelected = selectedIds.length;
  const remaining = requiredCount - totalSelected;

  const listRef = useRef(null);
  const [canScroll, setCanScroll] = useState(false);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;
    const check = () => setCanScroll(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeVariants.length]);

  function countOf(id) {
    return selectedIds.filter((s) => s === id).length;
  }

  function increment(variant) {
    if (variant.inStock === false) return;
    if (totalSelected >= requiredCount) return;
    if (countOf(variant.id) >= perRowMax) return;
    onChange([...selectedIds, variant.id]);
  }

  function decrement(variant) {
    const idx = selectedIds.lastIndexOf(variant.id);
    if (idx === -1) return;
    const next = [...selectedIds];
    next.splice(idx, 1);
    onChange(next);
  }

  return (
    <div className="combo-color-selector">
      <div className="combo-list" ref={listRef}>
        {activeVariants.map((variant) => {
          const count = countOf(variant.id);
          const outOfStock = variant.inStock === false;
          const plusDisabled = outOfStock || totalSelected >= requiredCount || count >= perRowMax;
          return (
            <div key={variant.id} className={`combo-row ${outOfStock ? 'out-of-stock' : ''}`}>
              <span className="combo-row-swatch" style={{ '--swatch-color': variant.colorCode }} />
              <span className="combo-row-name">{variant.colorName}</span>
              {outOfStock ? (
                <span className="combo-row-oos">Out of stock</span>
              ) : (
                <div className="combo-row-stepper">
                  <button
                    type="button"
                    className="combo-row-step-btn"
                    onClick={() => decrement(variant)}
                    disabled={count === 0}
                    aria-label={`Remove one ${variant.colorName}`}
                  >
                    <Minus size={13} />
                  </button>
                  <span className="combo-row-qty">{count}</span>
                  <button
                    type="button"
                    className="combo-row-step-btn"
                    onClick={() => increment(variant)}
                    disabled={plusDisabled}
                    aria-label={`Add one ${variant.colorName}`}
                  >
                    <Plus size={13} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {canScroll && <p className="combo-scroll-hint">Scroll for more colors ↓</p>}
    </div>
  );
}
