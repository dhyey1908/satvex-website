import { ShieldCheck, RotateCcw, Banknote, Truck } from 'lucide-react';
import { STOREFRONT } from '../config/storefront';
import { useSettings } from '../context/SettingsContext';
import './TrustRow.css';

const ICONS = { shield: ShieldCheck, rotate: RotateCcw, banknote: Banknote, truck: Truck };

/** Small icon row of reassurances; "Cash on Delivery" only if COD is enabled in settings. */
export function TrustRow({ omit = [] }) {
  const { settings } = useSettings();
  const codEnabled = settings?.cod?.enabled !== false;
  const items = STOREFRONT.trust.filter((t) => (!t.requiresCod || codEnabled) && !omit.includes(t.id));

  return (
    <ul className="trust-row" aria-label="Why shop with Satvex">
      {items.map(({ id, icon, label }) => {
        const Icon = ICONS[icon];
        return (
          <li key={id} className="trust-item">
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </li>
        );
      })}
    </ul>
  );
}
