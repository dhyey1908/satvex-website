import { motion } from 'framer-motion';
import './ColorSwatch.css';

export function ColorSwatch({ colorCode, colorName, selected, disabled, outOfStock, count, onClick, showLabel }) {
  const isDisabled = disabled || outOfStock;
  return (
    <span className="color-swatch-item">
      <motion.button
        type="button"
        className={`color-swatch ${selected ? 'selected' : ''} ${outOfStock ? 'out-of-stock' : ''}`}
        style={{ '--swatch-color': colorCode }}
        title={outOfStock ? `${colorName} — Out of Stock` : colorName}
        aria-label={outOfStock ? `${colorName} — Out of Stock` : colorName}
        aria-pressed={selected}
        aria-disabled={isDisabled}
        disabled={isDisabled}
        onClick={onClick}
        whileHover={isDisabled ? undefined : { scale: 1.08 }}
        whileTap={isDisabled ? undefined : { scale: 0.92 }}
        animate={{ scale: selected ? 1.06 : 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      >
        {count > 1 && <span className="swatch-count">{count}</span>}
      </motion.button>
      {/* Always-visible, not hover-only — a tooltip alone would be invisible
          on touch devices, and the spec calls for immediate recognition. */}
      {outOfStock && <span className="color-swatch-oos-label">Out of stock</span>}
      {showLabel && !outOfStock && <span className="color-swatch-name">{colorName}</span>}
    </span>
  );
}
