import { useLocation } from 'react-router-dom';
import { BrandLoader } from './BrandLoader';

// The storefront's loader. Customer-facing pages get the SATVEX brand loader;
// the admin area keeps the compact spinner, where speed matters more than
// ceremony. `variant="section"` is for one block of a page (no logo).
export function Loader({ label = 'Loading…', variant = 'page' }) {
  const { pathname } = useLocation();

  if (pathname.startsWith('/admin')) {
    return (
      <div className="state-block loader-block" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <p>{label}</p>
      </div>
    );
  }

  return <BrandLoader variant={variant} label={label} />;
}

export function Skeleton({ width = '100%', height = '1rem', style }) {
  return <div className="skeleton" style={{ width, height, ...style }} />;
}
