import { colorGroups } from '../utils/itemImage';
import './ColorChips.css';

/**
 * The colours chosen on a cart/order line as chips: a round swatch in the real
 * product colour (never themed, with a 1px border) and the name ("Red × 2" only when
 * a colour is picked more than once), with repeated colours grouped.
 */
export function ColorChips({ item, catalog, className = '', compact = false }) {
  const groups = colorGroups(item, catalog);
  if (groups.length === 0) return null;
  return (
    <ul className={`color-chips ${compact ? 'is-compact' : ''} ${className}`} aria-label="Selected colours">
      {groups.map((g) => (
        <li key={g.id} className="color-chip">
          <span className="color-chip-dot" style={{ background: g.code }} aria-hidden="true" />
          {g.count > 1 ? `${g.name} × ${g.count}` : g.name}
        </li>
      ))}
    </ul>
  );
}
