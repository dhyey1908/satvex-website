import './ui.css';

/** "1 order" / "8 orders". */
export const countLabel = (n, singular, plural = `${singular}s`) => `${n} ${n === 1 ? singular : plural}`;

/** Compact admin page title with a grey subtitle (usually the count) and the page's actions on the right. */
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="ui-page-header">
      <div className="ui-page-header-text">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="ui-page-header-actions">{actions}</div>}
    </div>
  );
}
