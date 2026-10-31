import { api } from './apiClient';

export const couponService = {
  // The codes the admin switched on as quick-apply chips: { chips: [{ code, discountLabel }] }
  chips: () => api.get('/coupons/chips'),
  // `directSession`: a Buy Now checkout checks the code against its own one item, not the bag.
  apply: (code, directSession) => api.post('/coupons/apply', { code, ...(directSession ? { directSession } : {}) }),
};
