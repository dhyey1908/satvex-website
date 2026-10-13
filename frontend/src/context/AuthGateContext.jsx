import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { PhoneAuthModal } from '../components/PhoneAuthModal';

const AuthGateContext = createContext(null);

// The single place every "this needs a logged-in user" action in the app
// goes through. Replaces the old pattern of redirecting to /login (a dead
// end now that customers have no signup/password page) with: open the
// phone+OTP popup in place, and resume whatever the user was trying to do
// the moment it succeeds.
export function AuthGateProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const pendingRef = useRef({ onSuccess: null, onCancel: null });

  const requireAuth = useCallback(
    (onSuccess, onCancel) => {
      if (isAuthenticated) {
        onSuccess?.();
        return true;
      }
      pendingRef.current = { onSuccess, onCancel };
      setOpen(true);
      return false;
    },
    [isAuthenticated]
  );

  const openLogin = useCallback(() => requireAuth(), [requireAuth]);

  function handleVerified(isNewAccount) {
    setOpen(false);
    const { onSuccess } = pendingRef.current;
    pendingRef.current = { onSuccess: null, onCancel: null };
    onSuccess?.(isNewAccount);
  }

  function handleClose() {
    setOpen(false);
    const { onCancel } = pendingRef.current;
    pendingRef.current = { onSuccess: null, onCancel: null };
    onCancel?.();
  }

  return (
    <AuthGateContext.Provider value={{ requireAuth, openLogin }}>
      {children}
      <PhoneAuthModal open={open} onClose={handleClose} onVerified={handleVerified} />
    </AuthGateContext.Provider>
  );
}

export function useAuthGate() {
  const ctx = useContext(AuthGateContext);
  if (!ctx) throw new Error('useAuthGate must be used within AuthGateProvider');
  return ctx;
}
