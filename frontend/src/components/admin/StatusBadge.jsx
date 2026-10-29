import { toneFor } from '../../utils/statusTones';
import './ui.css';

/** A coloured dot + label. Give `tone` directly, or `kind` + `value` to look it up (utils/statusTones). */
export function StatusBadge({ tone, kind, value, label, title }) {
  const t = tone || toneFor(kind, value);
  return (
    <span className={`ui-badge ui-badge-${t}`} title={title}>
      <span className="ui-badge-dot" aria-hidden="true" />
      {label ?? value}
    </span>
  );
}
