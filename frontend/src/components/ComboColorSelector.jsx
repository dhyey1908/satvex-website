import { useEffect, useId, useRef, useState } from 'react';
import { Check, Info, Minus, Palette, Plus } from 'lucide-react';
import './ComboColorSelector.css';

const TIP_KEY = 'satvex:colour-tip-seen';
const readTipSeen = () => {
  try {
    return window.localStorage.getItem(TIP_KEY) === '1';
  } catch {
    return false;
  }
};
const writeTipSeen = () => {
  try {
    window.localStorage.setItem(TIP_KEY, '1');
  } catch {
    /* private window / blocked storage: the tip simply stays session-only */
  }
};

/**
 * The colour-selection section for a selling option: a header with the "n / required selected" pill, a grid of colour
 * cards (swatch, name, "+ Add" which becomes a quantity stepper once picked).
 * Shared by the product page and the cart's "Edit colours" dialog.
 *
 * `selectedIds` is a flat array with one entry per selected unit (e.g. ['var_1','var_1','var_2'] = 2x var_1 + 1x var_2),
 * exactly as the cart, checkout and orders receive it. A colour can be picked more than once only when
 * allowDuplicateColors is true, the total can never exceed requiredCount (the combo size), and an out-of-stock colour
 * can never be selected. For a single-piece option, "+ Add" on another colour swaps the pick.
 *
 * `onBlocked(message)` is called when a tap can't change the selection (combo already full, colour already used once).
 * `error` is the inline message (incomplete / blocked selection); `shakeKey` makes the counter pill shake once each
 * time it changes; `notice` is optional content shown under the header (e.g. the "buy 4 get 1 free" note).
 */
export function ComboColorSelector({
  variants,
  requiredCount,
  allowDuplicateColors,
  selectedIds,
  onChange,
  onBlocked,
  error,
  errorRef,
  shakeKey = 0,
  notice = null,
}) {
  const activeVariants = variants.filter((v) => v.isActive);
  const perRowMax = allowDuplicateColors ? requiredCount : 1;
  const totalSelected = selectedIds.length;
  const isCombo = requiredCount > 1;
  const isFull = isCombo && totalSelected >= requiredCount;
  const isComplete = totalSelected === requiredCount;

  const countOf = (id) => selectedIds.filter((s) => s === id).length;

  const [tipSeen, setTipSeen] = useState(readTipSeen);
  const [infoOpen, setInfoOpen] = useState(false);
  const tooltipId = useId();
  const infoWrapRef = useRef(null);

  useEffect(() => {
    if (!infoOpen) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !infoWrapRef.current?.contains(e.target)) setInfoOpen(false);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', close);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', close);
    };
  }, [infoOpen]);

  function rememberTip() {
    if (tipSeen) return;
    setTipSeen(true);
    writeTipSeen();
  }

  function add(variant) {
    if (variant.inStock === false) return;
    if (requiredCount === 1) {
      onChange([variant.id]);
      rememberTip();
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
    rememberTip();
  }

  function remove(variant) {
    const idx = selectedIds.lastIndexOf(variant.id);
    if (idx === -1) return;
    const next = [...selectedIds];
    next.splice(idx, 1);
    onChange(next);
  }

  const showTip = isCombo && !tipSeen && totalSelected === 0 && activeVariants.length % 3 !== 0;

  return (
    <div className="ccs">
      <div className="ccs-header">
        <Palette className="ccs-header-icon" size={24} aria-hidden="true" />
        <div className="ccs-header-text">
          <div className="ccs-title" role="heading" aria-level="3">{isCombo ? 'Select Colours' : 'Select a Colour'}</div>
          <p className="ccs-subtitle">{isCombo ? 'Choose your favourite colours for this combo' : 'Choose your favourite colour'}</p>
        </div>
        {isCombo && (
          <div className="ccs-pill-wrap" ref={infoWrapRef}>
            <span
              key={shakeKey}
              className={`ccs-pill ${isComplete ? 'is-complete' : ''} ${shakeKey > 0 ? 'is-shaking' : ''}`}
              aria-live="polite"
              aria-atomic="true"
            >
              {isComplete && <Check size={14} strokeWidth={3} aria-hidden="true" />}
              {totalSelected} / {requiredCount} selected
            </span>
            <button
              type="button"
              className="ccs-info"
              aria-label="How colour selection works"
              aria-expanded={infoOpen}
              aria-describedby={infoOpen ? tooltipId : undefined}
              onClick={() => setInfoOpen((o) => !o)}
            >
              <Info size={18} aria-hidden="true" />
            </button>
            <div id={tooltipId} role="tooltip" className={`ccs-tooltip ${infoOpen ? 'is-open' : ''}`}>
              {allowDuplicateColors
                ? `Pick ${requiredCount} colours. You can choose the same colour more than once.`
                : `Pick ${requiredCount} different colours.`}
            </div>
          </div>
        )}
      </div>

      {notice}

      <div className="ccs-grid" role="group" aria-label="Colours">
        {activeVariants.map((variant) => {
          const count = countOf(variant.id);
          const outOfStock = variant.inStock === false;
          const selected = count > 0 && !outOfStock;
          const plusBlocked = isFull || count >= perRowMax;
          return (
            <div key={variant.id} className={`ccs-card ${selected ? 'is-selected' : ''} ${outOfStock ? 'is-oos' : ''}`}>
              {selected && (
                <span className="ccs-check" aria-hidden="true">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
              <span className="ccs-swatch" style={{ '--swatch-color': variant.colorCode }} aria-hidden="true" />
              <span className="ccs-name" title={variant.colorName}>{variant.colorName}</span>

              <div className="ccs-action">
                {outOfStock ? (
                  <>
                    <span className="ccs-oos">Out of stock</span>
                    {count > 0 && (
                      <button type="button" className="ccs-remove" onClick={() => remove(variant)} aria-label={`Remove ${variant.colorName}`}>
                        Remove
                      </button>
                    )}
                  </>
                ) : selected && isCombo ? (
                  <div className="ccs-stepper">
                    <button
                      type="button"
                      className="ccs-step ccs-step-minus"
                      onClick={() => remove(variant)}
                      aria-label={`Decrease quantity of ${variant.colorName}`}
                    >
                      <Minus size={18} aria-hidden="true" />
                    </button>
                    <span className="ccs-count">
                      <span aria-hidden="true">{count}</span>
                      <span className="visually-hidden">{count} of {variant.colorName} selected</span>
                    </span>
                    <button
                      type="button"
                      className="ccs-step ccs-step-plus"
                      onClick={() => add(variant)}
                      aria-disabled={plusBlocked}
                      aria-label={`Increase quantity of ${variant.colorName}`}
                    >
                      <Plus size={18} aria-hidden="true" />
                    </button>
                  </div>
                ) : selected ? (
                  <span className="ccs-chosen">
                    <Check size={16} strokeWidth={3} aria-hidden="true" /> Selected
                  </span>
                ) : (
                  <button
                    type="button"
                    className="ccs-add"
                    onClick={() => add(variant)}
                    aria-disabled={isCombo && plusBlocked}
                    aria-label={`Add ${variant.colorName}`}
                  >
                    <Plus size={16} aria-hidden="true" /> Add
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {showTip && (
          <div className="ccs-tip" aria-hidden="true">
            Add multiple colours easily! Use + or − to adjust quantity
          </div>
        )}
      </div>

      {error && (
        <p className="ccs-error" role="alert" ref={errorRef}>
          {error}
        </p>
      )}
    </div>
  );
}
