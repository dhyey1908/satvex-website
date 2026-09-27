import './PageHeader.css';

export function PageHeader({ eyebrow, title, count, countLabel = 'items', children }) {
  return (
    <div className="page-header">
      <div className="page-header-top">
        <div>
          {eyebrow && <div className="eyebrow-dot"><span>{eyebrow}</span></div>}
          <h1 className="text-headline-lg">{title}</h1>
          {typeof count === 'number' && (
            <p className="page-header-count">
              {count} {countLabel}
            </p>
          )}
        </div>
        {children && <div className="page-header-actions">{children}</div>}
      </div>
    </div>
  );
}
