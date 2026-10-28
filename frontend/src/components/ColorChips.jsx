import { colorGroups } from '../utils/itemImage';
import './ColorChips.css';

/**
 * The colours chosen on a cart/order line as chips: a round swatch in the real
 * product colour (never themed, with a 1px border) and "Red × 2" text, with
 * repeated colours grouped.
 */
export function ColorChips({ item, catalog, className = '' }) {
  const groups = colorGroups(item, catalog);
  if (groups.length === 0) return null;
  return (
    <ul className={`color-chips ${className}`} aria-label="Selected colours">
      {groups.map((g) => (
        <li key={g.id} className="color-chip">
          <span className="color-chip-dot" style={{ background: g.code }} aria-hidden="true" />
          {g.name} × {g.count}
        </li>
      ))}
    </ul>
  );
}
