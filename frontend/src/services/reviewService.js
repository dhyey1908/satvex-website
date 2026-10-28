import { api } from './apiClient';

export const reviewService = {
  // params: { sort: 'recent'|'highest'|'lowest', rating: 1-5, limit, offset }
  list: (productId, params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return api.get(`/products/${encodeURIComponent(productId)}/reviews${qs ? `?${qs}` : ''}`);
  },
  mine: (productId) => api.get(`/products/${encodeURIComponent(productId)}/reviews/mine`),
  listMine: () => api.get('/reviews/mine'),
  create: (productId, data) => api.post(`/products/${encodeURIComponent(productId)}/reviews`, data),
  update: (productId, data) => api.put(`/products/${encodeURIComponent(productId)}/reviews/mine`, data),
  getUploadUrl: (data) => api.post('/reviews/upload-url', data),
};
