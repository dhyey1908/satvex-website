import { api } from './apiClient';

export const authService = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (data) => api.post('/auth/reset-password', data),
  forgotPasswordPhone: (phone) => api.post('/auth/forgot-password-phone', { phone }),
  resetPasswordPhone: (data) => api.post('/auth/reset-password-phone', data),
  requestOtp: (phone) => api.post('/auth/request-otp', { phone }),
  verifyOtp: (phone, code) => api.post('/auth/verify-otp', { phone, code }),
  updateProfile: (data) => api.put('/auth/me', data),
  changePassword: (data) => api.put('/auth/me/password', data),
};
