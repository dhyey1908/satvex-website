import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authService } from '../services/authService';
import { setAuthToken } from '../services/apiClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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

  const login = useCallback(async (credentials) => {
    const { user: loggedInUser, token } = await authService.login(credentials);
    setAuthToken(token);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

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
    const { user: loggedInUser, token, isNewAccount } = await authService.verifyOtp(phone, code);
    setAuthToken(token);
    setUser(loggedInUser);
    return { user: loggedInUser, isNewAccount };
  }, []);

  const value = {
    user,
    loading,
    isAuthenticated: Boolean(user),
    isAdmin: user?.role === 'admin',
    login,
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
