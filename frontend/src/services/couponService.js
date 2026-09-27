import { api } from './apiClient';

export const couponService = {
  apply: (code) => api.post('/coupons/apply', { code }),
};
