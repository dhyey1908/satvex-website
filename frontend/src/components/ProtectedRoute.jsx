import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAuthGate } from '../context/AuthGateContext';
import { Loader } from './Loader';

// A direct visit to a protected URL (/cart, /checkout, /wishlist,
// /account/*) while logged out used to redirect to /login — now a dead end
// for customers since that page is admin-only. Instead, open the sign-in
// popup in place; cancelling it sends the visitor home rather than leaving
// them on a blank protected page with no way forward.
export function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth();
  const { requireAuth } = useAuthGate();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || isAuthenticated) return;
    requireAuth(() => {}, () => navigate('/', { replace: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isAuthenticated]);

  if (loading) return <Loader label="Checking your session…" />;
  if (!isAuthenticated) return <Loader label="Sign in to continue…" />;

  return <Outlet />;
}
