import { api } from './apiClient';

export const orderService = {
  checkout: (data) => api.post('/orders', data),
  list: () => api.get('/orders'),
  getById: (id) => api.get(`/orders/${encodeURIComponent(id)}`),
  cancel: (id) => api.post(`/orders/${encodeURIComponent(id)}/cancel`),
  reorder: (id) => api.post(`/orders/${encodeURIComponent(id)}/reorder`),
};
