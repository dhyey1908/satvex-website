import { api } from './apiClient';

export const addressService = {
  list: () => api.get('/addresses'),
  create: (data) => api.post('/addresses', data),
  update: (id, data) => api.put(`/addresses/${encodeURIComponent(id)}`, data),
  remove: (id) => api.delete(`/addresses/${encodeURIComponent(id)}`),
};
