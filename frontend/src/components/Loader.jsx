export function Loader({ label = 'Loading…' }) {
  return (
    <div className="state-block loader-block" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function Skeleton({ width = '100%', height = '1rem', style }) {
  return <div className="skeleton" style={{ width, height, ...style }} />;
}
