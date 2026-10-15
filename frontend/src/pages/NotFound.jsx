import { Link } from 'react-router-dom';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

export function NotFound() {
  useDocumentMeta({ title: 'Page not found', noindex: true });
  return (
    <div className="container section state-block">
      <h1>404</h1>
      <p>We couldn&apos;t find the page you were looking for.</p>
      <Link to="/" className="btn btn-primary">
        Back to Home
      </Link>
    </div>
  );
}
