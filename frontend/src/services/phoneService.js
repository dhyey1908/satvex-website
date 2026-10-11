import { api } from './apiClient';

export const phoneService = {
  sendOtp: (phone) => api.post('/phone/send-otp', { phone }),
  verifyOtp: (phone, code) => api.post('/phone/verify-otp', { phone, code }),
};
