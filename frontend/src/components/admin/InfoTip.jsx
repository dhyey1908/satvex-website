import { Info } from 'lucide-react';
import './ui.css';

/** A small (i) that explains something on hover, keyboard focus or tap. */
export function InfoTip({ label = 'More information', children }) {
  return (
    <span className="ui-tip">
      <button type="button" className="ui-tip-btn" aria-label={label}>
        <Info size={14} />
      </button>
      <span className="ui-tip-body" role="tooltip">{children}</span>
    </span>
  );
}
