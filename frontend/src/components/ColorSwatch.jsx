import { motion } from 'framer-motion';
import './ColorSwatch.css';

export function ColorSwatch({ colorCode, colorName, selected, disabled, count, onClick }) {
  return (
    <motion.button
      type="button"
      className={`color-swatch ${selected ? 'selected' : ''}`}
      style={{ '--swatch-color': colorCode }}
      title={colorName}
      aria-label={colorName}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      whileHover={disabled ? undefined : { scale: 1.08 }}
      whileTap={disabled ? undefined : { scale: 0.92 }}
      animate={{ scale: selected ? 1.06 : 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {count > 1 && <span className="swatch-count">{count}</span>}
    </motion.button>
  );
}
