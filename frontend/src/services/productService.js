import { api } from './apiClient';

export const productService = {
  list: () => api.get('/products'),
  getBySlug: (slug) => api.get(`/products/slug/${encodeURIComponent(slug)}`),
  getById: (id) => api.get(`/products/${encodeURIComponent(id)}`),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.put(`/products/${encodeURIComponent(id)}`, data),
  remove: (id) => api.delete(`/products/${encodeURIComponent(id)}`),
};
