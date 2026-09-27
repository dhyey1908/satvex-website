import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader } from './Loader';

export function AdminRoute() {
  const { isAuthenticated, isAdmin, loading } = useAuth();

  if (loading) return <Loader label="Checking access…" />;

  if (!isAuthenticated || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
