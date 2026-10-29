import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authService } from '../services/authService';
import { setAuthToken } from '../services/apiClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // An admin who has not turned on two-step sign-in yet is nudged to (banner).
  const [mfaSetupRequired, setMfaSetupRequired] = useState(false);

  const loadUser = useCallback(async () => {
    try {
      const { user: current } = await authService.me();
      setUser(current);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // The admin session ended (30 minutes without using the admin): drop it here
  // so the admin screens send the person back to sign in.
  useEffect(() => {
    function onSessionEnded() {
      setAuthToken(null);
      setUser(null);
    }
    window.addEventListener('satvex:session-ended', onSessionEnded);
    return () => window.removeEventListener('satvex:session-ended', onSessionEnded);
  }, []);

  // Both sign-in routes can answer "one more step" for an admin: { mfaRequired,
  // mfaToken, methods }. The caller shows the second step and finishes it with
  // completeMfa. Everyone else gets a session straight away.
  const startSession = useCallback((data) => {
    setAuthToken(data.token);
    setUser(data.user);
    setMfaSetupRequired(Boolean(data.mfaSetupRequired));
  }, []);

  const login = useCallback(async (credentials) => {
    const data = await authService.login(credentials);
    if (data.mfaRequired) return data;
    startSession(data);
    return data.user;
  }, [startSession]);

  const completeMfa = useCallback(async (payload) => {
    const data = await authService.mfa(payload);
    startSession(data);
    return { user: data.user, usedRecoveryCode: Boolean(data.usedRecoveryCode) };
  }, [startSession]);

  const register = useCallback(async (data) => {
    const { user: newUser, token } = await authService.register(data);
    setAuthToken(token);
    setUser(newUser);
    return newUser;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setAuthToken(null);
    setUser(null);
  }, []);

  // The customer-facing auth path: phone + OTP only. verify-otp creates the
  // account server-side if the number is new (see authController.verifyOtp)
  // — isNewAccount lets the caller show a "Welcome!" vs "Welcome back!"
  // toast without a second round trip.
  const loginWithOtp = useCallback(async (phone, code) => {
    const data = await authService.verifyOtp(phone, code);
    if (data.mfaRequired) return data;
    startSession(data);
    return { user: data.user, isNewAccount: data.isNewAccount };
  }, [startSession]);

  const value = {
    user,
    loading,
    isAuthenticated: Boolean(user),
    isAdmin: user?.role === 'admin',
    login,
    completeMfa,
    mfaSetupRequired,
    register,
    logout,
    loginWithOtp,
    refreshUser: loadUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
