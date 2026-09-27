import { Link } from 'react-router-dom';

export function NotFound() {
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
