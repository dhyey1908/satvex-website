import { api } from './apiClient';

export const adminService = {
  dashboard: () => api.get('/admin/dashboard'),
  customers: () => api.get('/admin/customers'),
  orders: (params) => api.get('/admin/orders', params),
  order: (id) => api.get(`/admin/orders/${encodeURIComponent(id)}`),
  updateOrderStatus: (id, status) => api.put(`/admin/orders/${encodeURIComponent(id)}/status`, { status }),
  refundOrder: (id, note) => api.post(`/admin/orders/${encodeURIComponent(id)}/refund`, note ? { note } : {}),
  contacts: () => api.get('/admin/contacts'),
  getSettings: () => api.get('/admin/settings'),
  updateSettings: (data) => api.put('/admin/settings', data),
  getUploadUrl: (data) => api.post('/admin/media/upload-url', data),
  getCoupons: () => api.get('/admin/coupons'),
  createCoupon: (data) => api.post('/admin/coupons', data),
  updateCoupon: (code, data) => api.put(`/admin/coupons/${encodeURIComponent(code)}`, data),
  deleteCoupon: (code) => api.delete(`/admin/coupons/${encodeURIComponent(code)}`),
  getCouponRedemptions: (code) => api.get(`/admin/coupons/${encodeURIComponent(code)}/redemptions`),
  reviews: () => api.get('/admin/reviews'),
  deleteReview: (id) => api.delete(`/admin/reviews/${encodeURIComponent(id)}`),
};
